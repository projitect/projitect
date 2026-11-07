import { Effect, Layer } from "effect"
import { BlueprintFileSystem, Errors } from "@projitect/core"
import type { BlueprintFileSystemShape } from "@projitect/core"

/**
 * Build a fresh in-memory `BlueprintFileSystem` Layer seeded with the given files.
 * Use it inside `it.effect(...)` tests:
 *
 *   it.effect("creates a region", () =>
 *     myBlueprint.plan.pipe(
 *       Effect.provide(makeInMemoryLayer({ ".gitignore": "" }))
 *     )
 *   )
 *
 * Reads outside the seeded set return `FsReadFailed`; permission checks are skipped (this is a
 * unit-test fixture, not the production permission gate).
 */
export const makeInMemoryLayer = (
  initial: Readonly<Record<string, string>> = {},
): Layer.Layer<BlueprintFileSystem> => {
  const state = new Map<string, string>(Object.entries(initial))

  const shape: BlueprintFileSystemShape = {
    readFile: (path) =>
      Effect.suspend(() => {
        const v = state.get(path)
        return v === undefined
          ? Effect.fail(
              new Errors.FsReadFailed({
                id: "pjt.fs.read-failed",
                path,
                cause: "ENOENT",
                message: `In-memory FS: no file at ${path}`,
              }),
            )
          : Effect.succeed(v)
      }),
    writeFile: (path, content) =>
      Effect.sync(() => {
        state.set(path, content)
      }),
    exists: (path) => Effect.sync(() => state.has(path)),
    remove: (path) =>
      Effect.suspend(() => {
        const prefix = `${path}/`
        return !state.has(path) && Array.from(state.keys()).some((k) => k.startsWith(prefix))
          ? Effect.fail(
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path,
                cause: "EISDIR",
                message: `In-memory FS: ${path} is a directory`,
              }),
            )
          : Effect.sync(() => {
              state.delete(path)
            })
      }),
    removeEmptyDir: (path) =>
      Effect.suspend(() => {
        const prefix = `${path}/`
        return Array.from(state.keys()).some((k) => k.startsWith(prefix))
          ? Effect.fail(
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path,
                cause: "ENOTEMPTY",
                message: `In-memory FS: ${path} is not empty`,
              }),
            )
          : Effect.void
      }),
    mkdir: (_path) => Effect.void,
    listDir: (prefix) =>
      Effect.sync(() => Array.from(state.keys()).filter((k) => k.startsWith(prefix))),
  }

  return Layer.succeed(BlueprintFileSystem, shape)
}

/**
 * Inspect helper for tests: read all paths currently held by an in-memory layer. Useful for
 * snapshot-style assertions about what a blueprint wrote.
 */
export const dumpFs = (
  layer: Layer.Layer<BlueprintFileSystem>,
): Effect.Effect<Readonly<Record<string, string>>> =>
  Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const keys = yield* fs.listDir("")
    const entries = yield* Effect.forEach(keys, (k) =>
      fs.readFile(k).pipe(
        Effect.map((v) => [k, v] as const),
        Effect.orElseSucceed(() => [k, ""] as const),
      ),
    )
    return Object.fromEntries(entries)
  }).pipe(
    Effect.provide(layer),
    Effect.orElseSucceed(() => ({})),
  )
