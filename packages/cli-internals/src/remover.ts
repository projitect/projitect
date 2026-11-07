import { Array, Effect, Match, Option, Predicate } from "effect"
import { PredicateX, RecordX, StringX } from "@nunofyobiz/effect-extras"
import { BlueprintFileSystem } from "@projitect/core"
import type { Errors, PjtLock } from "@projitect/core"
import { readIfExists } from "./project-file.js"
import { findRegion } from "./region.js"

/**
 * Apply removal operations through the project `BlueprintFileSystem`. Used by `pjt remodel` / `pjt build` after a blueprint
 * leaves `.pjt.ts` — the operations come from the diff between the previous lockfile and the
 * current blueprint set.
 *
 * Returns the list of paths actually mutated.
 */
export const applyRemovals = (params: {
  readonly removals: readonly PjtLock.LockOperation[]
}): Effect.Effect<readonly string[], RemoveError, BlueprintFileSystem> =>
  Effect.forEach(params.removals, (op) =>
    Effect.map(applyOne(op), (mutated) => (mutated ? Option.some(op.path) : Option.none<string>())),
  ).pipe(Effect.map(Array.getSomes))

type RemoveError =
  | Errors.RegionMissingEnd
  | Errors.RegionDuplicate
  | Errors.FsWriteFailed
  | Errors.FsPermissionDenied

const applyOne = (
  op: PjtLock.LockOperation,
): Effect.Effect<boolean, RemoveError, BlueprintFileSystem> =>
  Match.valueTags(op, {
    Region: (region) => removeRegion(region),
    Merge: (merge) => removeMergeKeys(merge.path, merge.ownedKeys),
    Owned: (owned) => removeFile(owned.path, owned.ownedDir),
    // Seed is write-once; we never delete the file when a seed blueprint leaves.
    Seed: () => Effect.succeed(false),
  })

const removeRegion = (
  op: PjtLock.LockRegionOp,
): Effect.Effect<boolean, RemoveError, BlueprintFileSystem> =>
  Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const current = yield* readIfExists(op.path)
    if (current === null) {
      return false
    }
    const found = yield* findRegion({
      fileContent: current,
      ownerId: op.ownerId,
      commentPrefix: op.commentPrefix,
      commentSuffix: op.commentSuffix ?? "",
      path: op.path,
    })
    if (found._tag === "Absent") {
      return false
    }
    const next = StringX.replaceLineRange(current, found.startLine, found.endLine, [])
    yield* fs.writeFile(op.path, next)
    return true
  })

const removeMergeKeys = (
  file: string,
  keys: readonly string[],
): Effect.Effect<boolean, RemoveError, BlueprintFileSystem> =>
  Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const raw = yield* readIfExists(file)
    if (raw === null) {
      return false
    }
    const parsed = yield* Effect.try(() => JSON.parse(raw) as unknown).pipe(Effect.option)
    if (Option.isNone(parsed) || !PredicateX.unsafeIsRecord(parsed.value)) {
      return false
    }

    // Fold each dotted key out of the tree, tracking whether anything actually changed.
    const seed: { readonly tree: unknown; readonly mutated: boolean } = {
      tree: parsed.value,
      mutated: false,
    }
    const result = Array.reduce(keys, seed, (state, key) =>
      Option.match(RecordX.deleteByPath(state.tree, key.split(".")), {
        onSome: (tree) => ({ tree, mutated: true }),
        onNone: () => state,
      }),
    )
    if (!result.mutated) {
      return false
    }
    yield* fs.writeFile(file, `${JSON.stringify(result.tree, null, 2)}\n`)
    return true
  })

const removeFile = (
  file: string,
  ownedDir: string | undefined,
): Effect.Effect<boolean, never, BlueprintFileSystem> =>
  Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    yield* fs.remove(file)
    if (Predicate.isNotUndefined(ownedDir)) {
      yield* pruneEmptyDirs(parentDir(file), ownedDir)
    }
    return true
  }).pipe(Effect.orElseSucceed(() => false))

// Project-relative paths use `/`; the parent of a top-level name is the project root (`""`).
const parentDir = (file: string): string => file.slice(0, Math.max(0, file.lastIndexOf("/")))

/** Remove empty directories upward from `dir` to `ownedDir` inclusive, never above it. */
const pruneEmptyDirs = (
  dir: string,
  ownedDir: string,
): Effect.Effect<void, never, BlueprintFileSystem> =>
  Effect.gen(function* () {
    if (dir !== ownedDir && !dir.startsWith(`${ownedDir}/`)) {
      return
    }
    const fs = yield* BlueprintFileSystem
    // Atomic: fails (and stops the climb) if `dir` holds any entry, however recently it appeared.
    yield* fs.removeEmptyDir(dir)
    if (dir !== ownedDir) {
      yield* pruneEmptyDirs(parentDir(dir), ownedDir)
    }
  }).pipe(Effect.orElseSucceed(() => undefined))
