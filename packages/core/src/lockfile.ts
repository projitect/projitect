import { Schema } from "effect"

/**
 * Per-operation ownership claim recorded in `.pjt.lock`. Mirrors a subset of
 * `ChangeSet.Operation` — just the identity fields needed to find and remove the operation if
 * its source blueprint leaves the tree later. The actual content isn't stored; it's regenerated
 * from the blueprint at plan time.
 */
export const LockRegionOp = Schema.TaggedStruct("Region", {
  path: Schema.String,
  ownerId: Schema.String,
  commentPrefix: Schema.String,
  /**
   * Optional closing delimiter for prefix/suffix-pair comment styles (HTML/MDX/XML). Absent for
   * single-prefix styles (`#`, `//`); readers treat the absence as the empty string.
   */
  commentSuffix: Schema.optional(Schema.String),
})

export const LockMergeOp = Schema.TaggedStruct("Merge", {
  path: Schema.String,
  ownedKeys: Schema.Array(Schema.String),
})

export const LockOwnedOp = Schema.TaggedStruct("Owned", {
  path: Schema.String,
  ownerId: Schema.String,
  ownedDir: Schema.optional(Schema.String),
})

export const LockSeedOp = Schema.TaggedStruct("Seed", {
  path: Schema.String,
  ownerId: Schema.String,
})

export const LockOperation = Schema.Union([LockRegionOp, LockMergeOp, LockOwnedOp, LockSeedOp])

export const BlueprintLockEntry = Schema.Struct({
  version: Schema.String,
  operations: Schema.Array(LockOperation),
})

/**
 * `.pjt.lock` schema. Committed alongside `package.json` so the team's drift-detection stays
 * consistent. Top-level `version` lets us evolve the file format with explicit migrations.
 */
export const PjtLock = Schema.Struct({
  version: Schema.Literal(1),
  blueprints: Schema.Record(Schema.String, BlueprintLockEntry),
})

export type LockRegionOp = typeof LockRegionOp.Type
export type LockMergeOp = typeof LockMergeOp.Type
export type LockOwnedOp = typeof LockOwnedOp.Type
export type LockSeedOp = typeof LockSeedOp.Type
export type LockOperation = typeof LockOperation.Type
export type BlueprintLockEntry = typeof BlueprintLockEntry.Type
export type PjtLock = typeof PjtLock.Type

/** Empty lockfile — used for the very first `pjt init`. */
export const empty: PjtLock = { version: 1, blueprints: {} }
