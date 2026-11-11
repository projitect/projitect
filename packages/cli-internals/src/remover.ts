import { Array, Effect, Match, Option, Predicate, Record, Result } from "effect"
import { PredicateX, RecordX, StringX } from "@nunofyobiz/effect-extras"
import { BlueprintFileSystem, Errors } from "@projitect/core"
import type { PjtLock } from "@projitect/core"
import { keySegments, valueAt } from "./merge-ownership.js"
import type { FilePlan, LegacyMergeClaim } from "./plan.js"
import { readIfExists } from "./project-file.js"
import { findRegion } from "./region.js"

/**
 * Apply removal operations through the project `BlueprintFileSystem`. Used by `pjt remodel` / `pjt build` after a blueprint
 * leaves `.pjt.ts` — the operations come from the diff between the previous lockfile and the
 * current blueprint set.
 *
 * `live` is the plan just applied: a JSON object it still writes, even an empty one, survives the
 * pruning of the fields a removal deleted from it.
 *
 * Returns the list of paths actually mutated.
 */
export const applyRemovals = (params: {
  readonly removals: readonly PjtLock.LockOperation[]
  readonly live?: readonly FilePlan[]
}): Effect.Effect<readonly string[], RemoveError, BlueprintFileSystem> =>
  Effect.forEach(params.removals, (op) =>
    Effect.map(applyOne(op, params.live ?? []), (mutated) =>
      mutated ? Option.some(op.path) : Option.none<string>(),
    ),
  ).pipe(Effect.map(Array.getSomes))

type RemoveError =
  | Errors.RegionMissingEnd
  | Errors.RegionDuplicate
  | Errors.FsWriteFailed
  | Errors.FsPermissionDenied

const applyOne = (
  op: PjtLock.LockOperation,
  live: readonly FilePlan[],
): Effect.Effect<boolean, RemoveError, BlueprintFileSystem> =>
  Match.valueTags(op, {
    Region: (region) => removeRegion(region),
    Merge: (merge) => removeMergeFields(merge, live),
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

const parseRecord = (raw: string | null): Option.Option<Record<string, unknown>> =>
  Option.filter(
    Option.flatMap(Option.fromNullishOr(raw), (text) =>
      Option.getSuccess(Result.try(() => JSON.parse(text) as unknown)),
    ),
    PredicateX.unsafeIsRecord,
  )

/**
 * A key is ambiguous when it currently holds a non-empty object: the lock cannot say which of its
 * children the blueprint wrote and which the user added. For a legacy claim (no recorded
 * `writtenPaths`) that is the parent key itself; for a recorded field it is a leaf the user turned
 * into an object. An absent key, a scalar, an array, `null` or `{}` has no such children.
 */
const isAmbiguous = (tree: Record<string, unknown>, key: string): boolean =>
  Option.exists(
    valueAt(tree, keySegments(key)),
    (value) => PredicateX.unsafeIsRecord(value) && !Record.isEmptyRecord(value),
  )

/** The legacy merge claims whose key currently holds an object `pjt remodel` cannot safely delete. */
export const findAmbiguousMergeClaims = (
  claims: readonly LegacyMergeClaim[],
): Effect.Effect<readonly LegacyMergeClaim[], never, BlueprintFileSystem> =>
  Effect.forEach(claims, (claim) =>
    Effect.map(readIfExists(claim.path), (raw) =>
      Option.exists(parseRecord(raw), (tree) => isAmbiguous(tree, claim.key))
        ? Option.some(claim)
        : Option.none<LegacyMergeClaim>(),
    ),
  ).pipe(Effect.map(Array.getSomes))

/** Fail with the first ambiguous legacy claim, before anything has been written. */
export const assertNoAmbiguousMergeClaims = (
  claims: readonly LegacyMergeClaim[],
): Effect.Effect<void, Errors.RemoveAmbiguousMergeClaim, BlueprintFileSystem> =>
  Effect.flatMap(findAmbiguousMergeClaims(claims), (ambiguous) =>
    Option.match(Array.head(ambiguous), {
      onNone: () => Effect.void,
      onSome: (claim) =>
        Effect.fail(
          new Errors.RemoveAmbiguousMergeClaim({
            id: "pjt.remove.ambiguous-merge-claim",
            path: claim.path,
            key: claim.key,
            ownerId: claim.blueprintId,
            message: `Blueprint ${claim.blueprintId} left .pjt.ts, but its lockfile entry only records the parent key "${claim.key}" in ${claim.path}, not the fields it wrote, so removing it could delete fields you added. Keep ${claim.blueprintId} in .pjt.ts and run \`pjt remodel\` once to upgrade .pjt.lock, then remove it; or delete "${claim.key}" from ${claim.path} by hand.`,
          }),
        ),
    }),
  )

/**
 * Delete what a departing merge claim wrote. A recorded `writtenPaths` list deletes exactly those
 * fields (an object left empty by the deletion goes with it); a legacy claim deletes its key only
 * when that key is unambiguous — `remodel` refuses the ambiguous ones before it gets here. Either
 * way a field that now holds an object with children is left alone.
 */
const removeMergeFields = (
  op: PjtLock.LockMergeOp,
  live: readonly FilePlan[],
): Effect.Effect<boolean, RemoveError, BlueprintFileSystem> =>
  Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const parsed = parseRecord(yield* readIfExists(op.path))
    if (Option.isNone(parsed)) {
      return false
    }
    const tree = parsed.value
    // A field that now holds an object with children keeps them: whatever the blueprint wrote
    // there was replaced, and the children are not its to delete.
    const targets = Array.filter(
      op.writtenPaths ?? op.ownedKeys,
      (field) => !isAmbiguous(tree, field),
    )

    // Fold each dotted field out of the tree, tracking whether anything actually changed.
    const seed: { readonly tree: unknown; readonly mutated: boolean } = { tree, mutated: false }
    const result = Array.reduce(targets, seed, (state, field) =>
      Option.match(RecordX.deleteByPath(state.tree, keySegments(field)), {
        onSome: (next) => ({ tree: next, mutated: true }),
        onNone: () => state,
      }),
    )
    if (!result.mutated) {
      return false
    }
    // Re-assert what the plan writes here: deleting a field prunes the object it emptied, and the
    // plan may still want that object (an empty `{}` is one the deep merge leaves in place).
    const kept = RecordX.deepMergeReducer.combineAll(
      Array.filterMap(live, (file) =>
        file._tag === "Merge" && file.path === op.path
          ? Result.succeed(file.value)
          : Result.failVoid,
      ),
    )
    yield* fs.writeFile(
      op.path,
      `${JSON.stringify(RecordX.deepMerge(result.tree, kept), null, 2)}\n`,
    )
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
