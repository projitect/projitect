import { promises as fs } from "node:fs"
import path from "node:path"
import { Array, Effect, Match, Option, Predicate } from "effect"
import { PredicateX, RecordX, StringX } from "@nunofyobiz/effect-extras"
import type { Errors, PjtLock } from "@projitect/core"
import { findRegion } from "./region.js"

/**
 * Apply removal operations to disk. Used by `pjt remodel` / `pjt build` after a blueprint
 * leaves `.pjt.ts` — the operations come from the diff between the previous lockfile and the
 * current blueprint set.
 *
 * Returns the list of paths actually mutated.
 */
export const applyRemovals = (params: {
  readonly removals: readonly PjtLock.LockOperation[]
  readonly projectRoot: string
}): Effect.Effect<readonly string[], Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Effect.forEach(params.removals, (op) =>
    Effect.map(
      applyOne({
        op,
        full: path.resolve(params.projectRoot, op.path),
        projectRoot: params.projectRoot,
      }),
      (mutated) => (mutated ? Option.some(op.path) : Option.none<string>()),
    ),
  ).pipe(Effect.map(Array.getSomes))

const readIfExists = (full: string): Promise<string | null> =>
  fs.readFile(full, "utf8").then(
    (s) => s,
    () => null,
  )

const applyOne = (params: {
  readonly op: PjtLock.LockOperation
  readonly full: string
  readonly projectRoot: string
}): Effect.Effect<boolean, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Match.valueTags(params.op, {
    Region: (op) => removeRegion(params.full, op),
    Merge: (op) => Effect.promise(() => removeMergeKeys(params.full, op.ownedKeys)),
    Owned: (op) =>
      Effect.promise(() =>
        removeFile(
          params.full,
          Predicate.isNotUndefined(op.ownedDir)
            ? path.resolve(params.projectRoot, op.ownedDir)
            : undefined,
        ),
      ),
    // Seed is write-once; we never delete the file when a seed blueprint leaves.
    Seed: () => Effect.succeed(false),
  })

const removeRegion = (
  full: string,
  op: PjtLock.LockRegionOp,
): Effect.Effect<boolean, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Effect.gen(function* () {
    const current = yield* Effect.promise(() => readIfExists(full))
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
    yield* Effect.promise(() => fs.writeFile(full, next, "utf8"))
    return true
  })

const removeMergeKeys = async (full: string, keys: readonly string[]): Promise<boolean> => {
  const raw = await readIfExists(full)
  if (raw === null) {
    return false
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  if (!PredicateX.unsafeIsRecord(parsed)) {
    return false
  }

  // Fold each dotted key out of the tree, tracking whether anything actually changed.
  const seed: { readonly tree: unknown; readonly mutated: boolean } = {
    tree: parsed,
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
  await fs.writeFile(full, `${JSON.stringify(result.tree, null, 2)}\n`, "utf8")
  return true
}

const removeFile = async (full: string, ownedDir: string | undefined): Promise<boolean> => {
  try {
    await fs.rm(full, { force: true })
    if (Predicate.isNotUndefined(ownedDir)) {
      await pruneEmptyDirs(path.dirname(full), ownedDir)
    }
    return true
  } catch {
    return false
  }
}

/** Remove empty directories upward from `dir` to `ownedDir` inclusive, never above it. */
const pruneEmptyDirs = async (dir: string, ownedDir: string): Promise<void> => {
  if (dir !== ownedDir && !dir.startsWith(`${ownedDir}${path.sep}`)) {
    return
  }
  const removed = await fs.rmdir(dir).then(
    () => true,
    () => false,
  )
  if (removed && dir !== ownedDir) {
    await pruneEmptyDirs(path.dirname(dir), ownedDir)
  }
}
