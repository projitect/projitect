import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect, Layer } from "effect"
import { BlueprintFileSystem, Errors } from "@projitect/core"
import type { Permission, BlueprintFileSystemShape } from "@projitect/core"
import { isPermitted } from "./permissions.js"
import type { FsOp } from "./permissions.js"

/**
 * Build the permission-gated `BlueprintFileSystem` Layer for one blueprint. The CLI provides a
 * fresh layer per blueprint, baking in that blueprint's `id` and declared `permissions`. All FS
 * paths get resolved relative to `projectRoot`; absolute paths or paths escaping `projectRoot`
 * are rejected with `pjt.fs.permission-denied`.
 *
 * This is the **soft sandbox**. A worker-process replacement is a tracked v2 follow-up; this
 * implementation enforces the same interface so the swap will be transparent to blueprint
 * authors.
 */
export const makeRealLayer = (config: {
  readonly blueprintId: string
  readonly permissions: readonly Permission.Permission[]
  readonly projectRoot: string
}): Layer.Layer<BlueprintFileSystem> => {
  const { blueprintId, permissions, projectRoot } = config
  const resolved = path.resolve(projectRoot)

  const denied = (p: string, op: FsOp, message: string) =>
    new Errors.FsPermissionDenied({
      id: "pjt.fs.permission-denied",
      path: p,
      operation: op,
      blueprintId,
      message,
    })

  // Real path of `full`, or — when it does not exist yet (a write or mkdir target) — of its nearest
  // existing ancestor with the missing remainder re-appended. A dangling symlink is followed to its
  // (missing) target rather than treated as a missing name, so a link to a not-yet-created file
  // outside the project cannot slip through; `hops` bounds circular links.
  const maxLinkHops = 40
  const realPathOf = async (full: string, hops = 0): Promise<string> => {
    try {
      return await fs.realpath(full)
    } catch {
      const parent = path.dirname(full)
      const stat = await fs.lstat(full).catch(() => undefined)
      if (stat?.isSymbolicLink() === true && hops < maxLinkHops) {
        const target = await fs.readlink(full)
        return realPathOf(path.resolve(await realPathOf(parent, hops), target), hops + 1)
      }
      if (parent === full) {
        return full
      }
      return path.join(await realPathOf(parent, hops), path.basename(full))
    }
  }

  // Accident-prevention, not hostile-code containment: the real path is resolved at check time, so
  // a link swapped between the check and the FS call is not caught.
  const resolvePath = (p: string, op: FsOp): Effect.Effect<string, Errors.FsPermissionDenied> =>
    Effect.gen(function* () {
      if (path.isAbsolute(p)) {
        return yield* denied(p, op, `Absolute paths are not allowed in blueprints: ${p}`)
      }
      const full = path.resolve(resolved, p)
      if (!full.startsWith(`${resolved}${path.sep}`) && full !== resolved) {
        return yield* denied(p, op, `Path escapes project root: ${p}`)
      }
      if (!isPermitted(permissions, op, p)) {
        return yield* denied(
          p,
          op,
          `Blueprint ${blueprintId} did not declare ${op} permission for ${p}`,
        )
      }
      const [realRoot, realFull] = yield* Effect.promise(() =>
        Promise.all([realPathOf(resolved), realPathOf(full)]),
      )
      const realRelative = path.relative(realRoot, realFull).split(path.sep).join("/")
      if (
        realRelative === ".." ||
        realRelative.startsWith("../") ||
        path.isAbsolute(realRelative)
      ) {
        return yield* denied(p, op, `Path resolves outside project root via symlink: ${p}`)
      }
      if (!isPermitted(permissions, op, realRelative)) {
        return yield* denied(
          p,
          op,
          `Blueprint ${blueprintId} did not declare ${op} permission for ${p} (resolves to ${realRelative})`,
        )
      }
      return full
    })

  const shape: BlueprintFileSystemShape = {
    readFile: (p) =>
      resolvePath(p, "read").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.readFile(full, "utf8"),
            catch: (e) =>
              new Errors.FsReadFailed({
                id: "pjt.fs.read-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to read ${p}`,
              }),
          }),
        ),
      ),
    writeFile: (p, content) =>
      resolvePath(p, "write").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: async () => {
              await fs.mkdir(path.dirname(full), { recursive: true })
              await fs.writeFile(full, content, "utf8")
            },
            catch: (e) =>
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to write ${p}`,
              }),
          }),
        ),
      ),
    exists: (p) =>
      resolvePath(p, "exists").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () =>
              fs.access(full).then(
                () => true,
                () => false,
              ),
            catch: () => false as never,
          }).pipe(Effect.orElseSucceed(() => false)),
        ),
      ),
    remove: (p) =>
      resolvePath(p, "remove").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.rm(full, { recursive: true, force: true }),
            catch: (e) =>
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to remove ${p}`,
              }),
          }),
        ),
      ),
    mkdir: (p) =>
      resolvePath(p, "mkdir").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.mkdir(full, { recursive: true }).then(() => undefined),
            catch: (e) =>
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to mkdir ${p}`,
              }),
          }),
        ),
      ),
    listDir: (p) =>
      resolvePath(p, "listDir").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.readdir(full),
            catch: (e) =>
              new Errors.FsReadFailed({
                id: "pjt.fs.read-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to list ${p}`,
              }),
          }),
        ),
      ),
  }

  return Layer.succeed(BlueprintFileSystem, shape)
}
