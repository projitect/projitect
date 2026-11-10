import { Array, Effect, Option } from "effect"
import { StructX } from "@nunofyobiz/effect-extras"
import type { Errors } from "@projitect/core"
import { isCommandPermitted } from "./permissions.js"
import type { PlannedCommand } from "./plan.js"
import { commandNotPermitted, nodeSpawner, runCommand } from "./platform/process-runner.js"
import type { ProcessSpawner } from "./platform/process-runner.js"

/**
 * The final phase of `build` and `remodel`: run the plan's `Exec` commands once every file
 * operation has succeeded.
 *
 * Every declaring blueprint's permissions must cover its own command; that is checked for the whole
 * list before any command starts, so a denial never leaves a half-run phase. Identical command
 * strings run once, at their first position. Commands run sequentially from the project root, in
 * blueprint tree order then op order, and the first failure stops the phase. Returns the commands
 * that ran.
 */
export const runPostApply = (params: {
  readonly commands: readonly PlannedCommand[]
  readonly projectRoot: string
  readonly spawner?: ProcessSpawner
}): Effect.Effect<readonly string[], Errors.ExecError> =>
  Effect.gen(function* () {
    const { commands, projectRoot, spawner = nodeSpawner } = params
    const denied = Array.findFirst(
      commands,
      (planned) => !isCommandPermitted(planned.permissions, planned.command),
    )
    if (Option.isSome(denied)) {
      return yield* commandNotPermitted(denied.value.command)
    }
    const unique = Array.dedupeWith(commands, (a, b) => a.command === b.command)
    yield* Effect.forEach(
      unique,
      (planned) =>
        runCommand({
          permissions: planned.permissions,
          command: planned.command,
          cwd: projectRoot,
          spawner,
        }),
      { discard: true },
    )
    return Array.map(unique, (planned) => planned.command)
  })

/** One check command that failed during `pjt inspect`; `exitCode` is absent when it never started. */
export interface CheckFailure {
  readonly ownerId: string
  readonly check: string
  readonly exitCode?: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * The command half of `pjt inspect`: run each distinct `check` of the plan's `Exec` commands, in
 * tree order, and collect the ones that fail. A command without a `check` is skipped. As in
 * {@link runPostApply}, every check's permissions are tested before any starts, so a denial fails
 * the whole run instead of passing silently. A failing check — including one that could not be
 * started — is drift, not an error: it becomes a {@link CheckFailure} and the remaining checks run.
 */
export const runChecks = (params: {
  readonly commands: readonly PlannedCommand[]
  readonly projectRoot: string
  readonly spawner?: ProcessSpawner
}): Effect.Effect<readonly CheckFailure[], Errors.CommandNotPermitted> =>
  Effect.gen(function* () {
    const { commands, projectRoot, spawner = nodeSpawner } = params
    const checks = Array.flatMap(commands, (planned) =>
      planned.check === undefined ? [] : [{ planned, check: planned.check }],
    )
    const denied = Array.findFirst(
      checks,
      ({ planned, check }) => !isCommandPermitted(planned.permissions, check),
    )
    if (Option.isSome(denied)) {
      return yield* commandNotPermitted(denied.value.check)
    }
    const unique = Array.dedupeWith(checks, (a, b) => a.check === b.check)
    const results = yield* Effect.forEach(unique, ({ planned, check }) =>
      runCommand({
        permissions: planned.permissions,
        command: check,
        cwd: projectRoot,
        spawner,
      }).pipe(
        Effect.as(Option.none<CheckFailure>()),
        Effect.catchTag("CommandFailed", (failed) =>
          Effect.succeed(
            Option.some<CheckFailure>({
              ownerId: planned.ownerId,
              check,
              ...StructX.defined("exitCode", failed.exitCode),
              stdout: failed.stdout,
              stderr: failed.stderr === "" ? (failed.cause ?? "") : failed.stderr,
            }),
          ),
        ),
      ),
    )
    return Array.getSomes(results)
  })
