import { Array, Cause, Effect, Exit, Layer, Match, Option, Predicate, Schema } from "effect"
import { BlueprintFileSystem, ChangeSet, Errors } from "@projitect/core"
import type { Blueprint } from "@projitect/core"
import { isDirectoryBlueprint } from "@projitect/blueprint"
import type { DirectoryBlueprint } from "@projitect/blueprint"
import { describe, isEffectTree, isProjitectFile } from "../loader.js"
import { makeClient } from "../ipc/client.js"
import type { Transport } from "../ipc/transport.js"
import { decodeToChild, encodeFromChild } from "./protocol.js"
import type { FromChild, PlannedBlueprint } from "./protocol.js"

/**
 * Entry point of the confined worker process (`node --permission`). It imports the module the parent
 * transpiled from `.pjt.ts`, runs the config-time Effect and every blueprint's plan, and answers
 * with plain data. Every `BlueprintFileSystem` call travels to the parent over the fork channel; the
 * worker itself is not granted any filesystem access beyond reading its own code.
 */

type Node = Blueprint.Blueprint | DirectoryBlueprint

interface Flat {
  readonly blueprint: Blueprint.Blueprint
  readonly directoryPrefix: string
}

const flattenTree = (tree: readonly Node[], prefix: string): readonly Flat[] =>
  Array.flatMap(tree, (node) =>
    isDirectoryBlueprint(node)
      ? flattenTree(node.children, prefix === "" ? node.name : `${prefix}/${node.name}`)
      : [{ blueprint: node, directoryPrefix: prefix }],
  )

const post = (message: FromChild): void => {
  Effect.runFork(
    encodeFromChild(message).pipe(
      Effect.tap((encoded) =>
        Effect.sync(() => {
          process.send?.(encoded)
        }),
      ),
      Effect.ignore,
    ),
  )
}

const scopeHandlers = new Map<number, (frame: unknown) => void>()
let nextScope = 0

/** A `Transport` for one blueprint: announces its id and permissions, then tunnels `Fs` frames. */
const openScope = (
  blueprintId: string,
  permissions: Blueprint.Blueprint["permissions"],
  directoryPrefix: string,
): Transport => {
  const scope = nextScope++
  post({ _tag: "Open", scope, blueprintId, permissions, directoryPrefix })
  return {
    send: (frame) => {
      post({ _tag: "Fs", scope, frame })
    },
    onMessage: (handler) => {
      scopeHandlers.set(scope, handler)
    },
  }
}

const fsLayerFor = (
  blueprintId: string,
  permissions: Blueprint.Blueprint["permissions"],
  directoryPrefix: string,
): Layer.Layer<BlueprintFileSystem> =>
  Layer.succeed(
    BlueprintFileSystem,
    makeClient(openScope(blueprintId, permissions, directoryPrefix)),
  )

/** Node's permission errors carry the denied `resource`; name it so an allowlist miss is diagnosable. */
const describeImportFailure = (e: unknown): string =>
  Match.value(e).pipe(
    Match.when(
      (error: unknown): error is Error & { readonly resource: string } =>
        Predicate.isError(error) && "resource" in error && typeof error.resource === "string",
      (error) => `${error.message} (${error.resource})`,
    ),
    Match.when(Predicate.isError, (error) => error.message),
    Match.orElse(String),
  )

const run = (start: { readonly modulePath: string; readonly blueprintFile: string }) =>
  Effect.gen(function* () {
    const { modulePath, blueprintFile } = start
    const module_ = yield* Effect.tryPromise({
      try: (): Promise<{ readonly default?: unknown }> => import(modulePath),
      catch: (e) => {
        const cause = describeImportFailure(e)
        return new Errors.LoaderImportFailed({
          id: "pjt.loader.import-failed",
          blueprintFile,
          cause,
          message: `Failed to import ${blueprintFile}: ${cause}`,
        })
      },
    })
    const value = module_.default
    if (!isProjitectFile(value)) {
      const received = describe(value)
      return yield* new Errors.LoaderInvalidDefaultExport({
        id: "pjt.loader.invalid-default-export",
        blueprintFile,
        received,
        message: `${blueprintFile} must \`export default pjt({...})\`. Received ${received}.`,
      })
    }
    const tree = isEffectTree(value.blueprints)
      ? yield* value.blueprints.pipe(
          Effect.provide(fsLayerFor("pjt:config-loader", [{ kind: "read", glob: "**" }], "")),
        )
      : value.blueprints
    return yield* Effect.forEach(flattenTree(tree, ""), ({ blueprint, directoryPrefix }) =>
      blueprint.plan.pipe(
        Effect.provide(fsLayerFor(blueprint.id, blueprint.permissions, directoryPrefix)),
        Effect.map(
          (changeSet): PlannedBlueprint => ({
            id: blueprint.id,
            version: blueprint.version,
            permissions: blueprint.permissions,
            directoryPrefix,
            changeSet: Schema.decodeUnknownSync(ChangeSet.ChangeSet)(changeSet),
          }),
        ),
      ),
    )
  })

process.on("message", (raw) => {
  Effect.runFork(
    decodeToChild(raw).pipe(
      Effect.flatMap((message) => {
        if (message._tag === "Fs") {
          return Effect.sync(() => {
            scopeHandlers.get(message.scope)?.(message.frame)
          })
        }
        return Effect.exit(run(message)).pipe(
          Effect.map((exit) =>
            Exit.match(exit, {
              onSuccess: (blueprints): FromChild => ({ _tag: "Planned", blueprints }),
              onFailure: (cause): FromChild =>
                Option.match(Cause.findErrorOption(cause), {
                  onSome: (error) => ({ _tag: "Failed", error }),
                  onNone: () => ({ _tag: "Defect", message: Cause.pretty(cause) }),
                }),
            }),
          ),
          Effect.tap((reply) =>
            Effect.sync(() => {
              post(reply)
            }),
          ),
        )
      }),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          post({ _tag: "Defect", message: Cause.pretty(cause) })
        }),
      ),
    ),
  )
})
