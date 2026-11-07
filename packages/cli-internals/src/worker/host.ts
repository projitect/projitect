import { fork } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Array, Effect, Match } from "effect"
import { Errors } from "@projitect/core"
import { serve } from "../ipc/server.js"
import { makeRealShape } from "../filesystem-impl.js"
import { computeReadAllowlist, permissionFlag } from "./allowlist.js"
import { decodeFromChild, encodeToChild } from "./protocol.js"
import type { ChildError, FromChild, PlannedBlueprint } from "./protocol.js"
import { transpileBlueprintFile } from "./transpile.js"

/** How long the worker may take to deliver every blueprint's plan before it is killed. */
export const WORKER_TIMEOUT_MS = 60_000

/** How much of the worker's stderr is kept to explain a crash. */
const STDERR_TAIL_BYTES = 2000

// Resolves to `dist/worker/child-entry.js` from both `src/worker/` (tests) and `dist/worker/` (the CLI).
const workerEntry = fileURLToPath(new URL("../../dist/worker/child-entry.js", import.meta.url))

export type PlanBlueprintFileError =
  | ChildError
  | Errors.ConfigBlueprintFileNotFound
  | Errors.WorkerError

const exitDescription = (exitCode: number | null, signal: NodeJS.Signals | null): string =>
  signal === null ? `exit code ${exitCode ?? "unknown"}` : `signal ${signal}`

const runWorker = (params: {
  readonly child: ChildProcess
  readonly blueprintFile: string
  readonly modulePath: string
  readonly projectRoot: string
  readonly stderrTail: () => string
  readonly timeoutMs: number
}): Effect.Effect<readonly PlannedBlueprint[], ChildError | Errors.WorkerError> => {
  const { child, blueprintFile, modulePath, projectRoot, stderrTail, timeoutMs } = params
  return Effect.callback<readonly PlannedBlueprint[], ChildError | Errors.WorkerError>((resume) => {
    const scopes = new Map<number, (frame: unknown) => void>()
    const sendFs = (scope: number, frame: unknown): void => {
      Effect.runFork(
        encodeToChild({ _tag: "Fs", scope, frame }).pipe(
          Effect.tap((encoded) =>
            Effect.sync(() => {
              if (child.connected) {
                child.send(encoded)
              }
            }),
          ),
          Effect.ignore,
        ),
      )
    }
    const settle = (
      effect:
        | Effect.Effect<never, ChildError | Errors.WorkerError>
        | Effect.Effect<readonly PlannedBlueprint[]>,
    ): void => {
      resume(effect)
    }
    const handle = (message: FromChild): void => {
      Match.value(message).pipe(
        Match.tag("Open", ({ scope, blueprintId, permissions, directoryPrefix }) => {
          serve(
            {
              send: (frame) => {
                sendFs(scope, frame)
              },
              onMessage: (handler) => {
                scopes.set(scope, handler)
              },
            },
            makeRealShape({
              blueprintId,
              permissions,
              projectRoot: path.join(projectRoot, directoryPrefix),
            }),
          )
        }),
        Match.tag("Fs", ({ scope, frame }) => {
          scopes.get(scope)?.(frame)
        }),
        Match.tag("Planned", ({ blueprints }) => {
          settle(Effect.succeed(blueprints))
        }),
        Match.tag("Failed", ({ error }) => {
          settle(Effect.fail(error))
        }),
        Match.tag("Defect", ({ message: cause }) => {
          settle(
            Effect.fail(
              new Errors.WorkerCrashed({
                id: "pjt.worker.crashed",
                message: `The blueprint worker failed while planning ${blueprintFile}: ${cause}`,
              }),
            ),
          )
        }),
        Match.exhaustive,
      )
    }

    child.on("message", (raw) => {
      Effect.runFork(
        decodeFromChild(raw).pipe(
          Effect.tap((message) =>
            Effect.sync(() => {
              handle(message)
            }),
          ),
          Effect.catch((error) =>
            Effect.sync(() => {
              settle(
                Effect.fail(
                  new Errors.WorkerCrashed({
                    id: "pjt.worker.crashed",
                    message: `The blueprint worker sent a message the CLI could not read while planning ${blueprintFile}: ${error.message}`,
                  }),
                ),
              )
            }),
          ),
        ),
      )
    })
    child.on("exit", (exitCode, signal) => {
      // A clean exit without a result means the worker quit before planning finished; any other
      // exit is a crash. Messages already queued are handled first because `exit` fires after them.
      const detail = exitDescription(exitCode, signal)
      const stderr = stderrTail()
      const suffix = stderr === "" ? "" : `\n${stderr}`
      settle(
        Effect.fail(
          exitCode === 0 && signal === null
            ? new Errors.WorkerExitedEarly({
                id: "pjt.worker.exited-early",
                exitCode,
                message: `The blueprint worker exited (${detail}) before it returned a plan for ${blueprintFile}.${suffix}`,
              })
            : new Errors.WorkerCrashed({
                id: "pjt.worker.crashed",
                ...(exitCode === null ? {} : { exitCode }),
                ...(signal === null ? {} : { signal }),
                message: `The blueprint worker crashed (${detail}) while planning ${blueprintFile}.${suffix}`,
              }),
        ),
      )
    })
    child.on("error", (error) => {
      settle(
        Effect.fail(
          new Errors.WorkerCrashed({
            id: "pjt.worker.crashed",
            message: `The blueprint worker could not run for ${blueprintFile}: ${error.message}`,
          }),
        ),
      )
    })

    Effect.runFork(
      encodeToChild({ _tag: "Start", modulePath, blueprintFile }).pipe(
        Effect.tap((encoded) =>
          Effect.sync(() => {
            child.send(encoded)
          }),
        ),
        Effect.ignore,
      ),
    )
  }).pipe(
    Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () =>
        Effect.fail(
          new Errors.WorkerTimedOut({
            id: "pjt.worker.timed-out",
            timeoutMs,
            message: `The blueprint worker did not return a plan for ${blueprintFile} within ${timeoutMs / 1000}s and was stopped.`,
          }),
        ),
    }),
  )
}

/**
 * Run `.pjt.ts` — its config-time Effect and every blueprint's plan — in a child Node process
 * started with Node's permission model, and return what each blueprint planned.
 *
 * The child may read only the allowlist from {@link computeReadAllowlist}, and is given no
 * child-process or worker permission. Project files reach it only through the parent-side
 * permission gate. This reduces accidental filesystem and process access by blueprint code and its
 * dependencies; it does not contain deliberately malicious code.
 */
export const planBlueprintFile = (params: {
  readonly blueprintFile: string
  readonly projectRoot: string
  /** Defaults to {@link WORKER_TIMEOUT_MS}. */
  readonly timeoutMs?: number
}): Effect.Effect<readonly PlannedBlueprint[], PlanBlueprintFileError> => {
  const { blueprintFile, projectRoot, timeoutMs = WORKER_TIMEOUT_MS } = params
  const full = path.resolve(projectRoot, blueprintFile)
  return Effect.gen(function* () {
    const exists = yield* Effect.promise(() =>
      access(full).then(
        () => true,
        () => false,
      ),
    )
    if (!exists) {
      return yield* new Errors.ConfigBlueprintFileNotFound({
        id: "pjt.config.blueprint-file-not-found",
        blueprintFile,
        message: `No blueprint file found at ${full}. Run \`pjt init\` to create one.`,
      })
    }
    const { moduleFile, imports } = yield* transpileBlueprintFile({ blueprintFile, full })
    const allowlist = computeReadAllowlist({
      workerEntry,
      blueprintFile: full,
      moduleFile,
      imports,
      projectRoot,
      execPath: process.execPath,
    })
    let stderr = ""
    const child = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const spawned = fork(workerEntry, [], {
          // `execArgv` replaces the CLI's own flags, so a `tsx` loader never reaches the worker.
          execArgv: [
            permissionFlag(process.versions.node),
            "--disable-warning=ExperimentalWarning",
            ...Array.map(allowlist, (entry) => `--allow-fs-read=${entry}`),
          ],
          env: {},
          cwd: path.dirname(workerEntry),
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        })
        spawned.stderr?.on("data", (chunk: Buffer) => {
          stderr = `${stderr}${chunk.toString()}`.slice(-STDERR_TAIL_BYTES)
        })
        return spawned
      }),
      (spawned) =>
        Effect.sync(() => {
          if (spawned.exitCode === null && spawned.signalCode === null) {
            spawned.kill("SIGKILL")
          }
        }),
    )
    return yield* runWorker({
      child,
      blueprintFile,
      modulePath: pathToFileURL(moduleFile).href,
      projectRoot,
      stderrTail: () => stderr.trim(),
      timeoutMs,
    })
  }).pipe(Effect.scoped)
}
