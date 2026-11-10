import { Array, Effect, Layer, Match, Option, String } from "effect"
import { BlueprintFileSystem, Errors } from "@projitect/core"
import type { BlueprintFileSystemShape, Permission } from "@projitect/core"
import { isPermitted } from "./permissions.js"
import type { FsOp } from "./permissions.js"

/**
 * Wrap any `BlueprintFileSystem` (the in-memory one in a browser) in the same permission gate the
 * CLI applies to the disk: a blueprint only reaches the paths its declared `permissions` cover, and
 * absolute or project-escaping paths are rejected. Pure — no `node:*` — so it runs client-side.
 *
 * Soft sandbox, like `makeRealLayer`: accident prevention, not hostile-code containment.
 */
export const makeGatedLayer = (
  base: Layer.Layer<BlueprintFileSystem>,
  config: {
    readonly blueprintId: string
    readonly permissions: readonly Permission.Permission[]
  },
): Layer.Layer<BlueprintFileSystem> =>
  Layer.effect(
    BlueprintFileSystem,
    Effect.gen(function* () {
      const inner = yield* BlueprintFileSystem
      return gate(inner, config)
    }),
  ).pipe(Layer.provide(base))

const escapesRoot = (p: string): boolean => Array.some(p.split("/"), (segment) => segment === "..")

const gate = (
  inner: BlueprintFileSystemShape,
  config: {
    readonly blueprintId: string
    readonly permissions: readonly Permission.Permission[]
  },
): BlueprintFileSystemShape => {
  const check = (p: string, op: FsOp): Effect.Effect<void, Errors.FsPermissionDenied> => {
    const reason = Match.value(p).pipe(
      Match.when(
        String.startsWith("/"),
        () => `Absolute paths are not allowed in blueprints: ${p}`,
      ),
      Match.when(escapesRoot, () => `Path escapes project root: ${p}`),
      Match.when(
        (candidate) => !isPermitted(config.permissions, op, candidate),
        () => `Blueprint ${config.blueprintId} did not declare ${op} permission for ${p}`,
      ),
      Match.option,
    )
    return Option.match(reason, {
      onNone: () => Effect.void,
      onSome: (message) =>
        Effect.fail(
          new Errors.FsPermissionDenied({
            id: "pjt.fs.permission-denied",
            path: p,
            operation: op,
            blueprintId: config.blueprintId,
            message,
          }),
        ),
    })
  }
  return {
    readFile: (p) => Effect.andThen(check(p, "read"), inner.readFile(p)),
    writeFile: (p, content) => Effect.andThen(check(p, "write"), inner.writeFile(p, content)),
    exists: (p) => Effect.andThen(check(p, "exists"), inner.exists(p)),
    remove: (p) => Effect.andThen(check(p, "remove"), inner.remove(p)),
    removeEmptyDir: (p) => Effect.andThen(check(p, "removeEmptyDir"), inner.removeEmptyDir(p)),
    mkdir: (p) => Effect.andThen(check(p, "mkdir"), inner.mkdir(p)),
    listDir: (p) => Effect.andThen(check(p, "listDir"), inner.listDir(p)),
  }
}
