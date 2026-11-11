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
  /**
   * Provenance recorded by lockfile v3: the dotted fields the blueprint's merge value actually
   * wrote — plain objects recurse, arrays and scalars are whole fields. Removal deletes only
   * these, so children a user added under an owned key survive. Absent on every entry read from
   * a v1 or v2 lockfile, which marks a legacy claim.
   */
  writtenPaths: Schema.optional(Schema.Array(Schema.String)),
})

export const LockOwnedOp = Schema.TaggedStruct("Owned", {
  path: Schema.String,
  ownerId: Schema.String,
  ownedDir: Schema.optional(Schema.String),
  /**
   * Content hash of an owned binary file, recorded by lockfile v2. Absent for text files and for
   * every entry read from a v1 lockfile.
   */
  contentHash: Schema.optional(Schema.String),
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
 * consistent. Top-level `version` lets us evolve the file format with explicit migrations: readers
 * accept v1, v2 and v3, and the engine writes v3.
 */
export const PjtLock = Schema.Struct({
  version: Schema.Literals([1, 2, 3]),
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
export const empty: PjtLock = { version: 3, blueprints: {} }
