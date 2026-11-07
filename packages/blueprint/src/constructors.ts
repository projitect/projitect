import { Effect } from "effect"
import { StructX } from "@nunofyobiz/effect-extras"
import type { Blueprint, Permission, Errors, BlueprintFileSystem } from "@projitect/core"
import { ChangeSet } from "@projitect/core"

/**
 * Spec for a region-mode blueprint: replace or insert the marked section in a shared text file.
 * Multiple blueprints can coexist in the same file as long as they use different `ownerId`s.
 */
export interface RegionFileSpec {
  readonly id: string
  readonly version: string
  readonly description?: string
  readonly path: string
  readonly commentPrefix?: string
  /**
   * Optional closing delimiter for prefix/suffix-pair comment styles. Set to `" -->"` for
   * HTML/MDX. Leave undefined (default) for single-prefix styles like `#` and `//`.
   */
  readonly commentSuffix?: string
  readonly content: string
  readonly extraPermissions?: readonly Permission.Permission[]
}

/**
 * Create a region-mode blueprint. The blueprint's `id` doubles as the region's `ownerId`.
 * `commentPrefix` defaults to `#` (suitable for `.gitignore` / YAML / shell).
 *
 * For HTML / MDX / XML files, prefer the `markdownSection` helper — it sets the right
 * prefix and suffix pair for you. For ignore-style files, prefer `ignoreSection` — same
 * shape with a name that documents its intent.
 */
export const regionFile = (spec: RegionFileSpec): Blueprint.Blueprint => ({
  id: spec.id,
  version: spec.version,
  ...StructX.defined("description", spec.description),
  permissions: [
    { kind: "write", glob: spec.path },
    { kind: "read", glob: spec.path },
    ...(spec.extraPermissions ?? []),
  ],
  plan: Effect.succeed(
    ChangeSet.of(
      ChangeSet.RegionOp.make({
        ownerId: spec.id,
        path: spec.path,
        commentPrefix: spec.commentPrefix ?? "#",
        ...StructX.defined("commentSuffix", spec.commentSuffix),
        content: spec.content,
      }),
    ),
  ),
})

/**
 * Spec for a merge-mode blueprint: deep-merge a partial value into a structured (JSON) file.
 * The `ownedKeys` list declares which dotted-path keys this blueprint claims — two blueprints
 * claiming the same key is a `pjt.plan.conflict-merge` error.
 */
export interface JsonMergeSpec {
  readonly id: string
  readonly version: string
  readonly description?: string
  readonly path: string
  readonly ownedKeys: readonly string[]
  readonly value: unknown
  readonly extraPermissions?: readonly Permission.Permission[]
}

/**
 * Create a merge-mode blueprint for a JSON file (typically `package.json` / `tsconfig.json`).
 */
export const jsonMerge = (spec: JsonMergeSpec): Blueprint.Blueprint => ({
  id: spec.id,
  version: spec.version,
  ...StructX.defined("description", spec.description),
  permissions: [
    { kind: "write", glob: spec.path },
    { kind: "read", glob: spec.path },
    ...(spec.extraPermissions ?? []),
  ],
  plan: Effect.succeed(
    ChangeSet.of(
      ChangeSet.MergeOp.make({
        ownerId: spec.id,
        path: spec.path,
        ownedKeys: spec.ownedKeys,
        value: spec.value,
      }),
    ),
  ),
})

/**
 * Spec for an owned-mode blueprint: this blueprint owns the file's entire content. Any other
 * blueprint touching the same path is a `pjt.plan.conflict-owned` error.
 */
export interface OwnFileSpec {
  readonly id: string
  readonly version: string
  readonly description?: string
  readonly path: string
  readonly content: string
  /** Directory the file's owner manages; empty directories are pruned up to it on removal. */
  readonly ownedDir?: string
  readonly extraPermissions?: readonly Permission.Permission[]
}

export const ownFile = (spec: OwnFileSpec): Blueprint.Blueprint => ({
  id: spec.id,
  version: spec.version,
  ...StructX.defined("description", spec.description),
  permissions: [{ kind: "write", glob: spec.path }, ...(spec.extraPermissions ?? [])],
  plan: Effect.succeed(
    ChangeSet.of(
      ChangeSet.OwnedOp.make({
        ownerId: spec.id,
        path: spec.path,
        content: spec.content,
        ...StructX.defined("ownedDir", spec.ownedDir),
      }),
    ),
  ),
})

/**
 * Spec for a seed-mode blueprint: write the file at first build, never enforce it again. Useful
 * for templates the project maintainer is expected to customize (e.g. README, initial `.pjt.ts`).
 */
export interface SeedFileSpec {
  readonly id: string
  readonly version: string
  readonly description?: string
  readonly path: string
  readonly content: string
  readonly extraPermissions?: readonly Permission.Permission[]
}

export const seedFile = (spec: SeedFileSpec): Blueprint.Blueprint => ({
  id: spec.id,
  version: spec.version,
  ...StructX.defined("description", spec.description),
  permissions: [{ kind: "write", glob: spec.path }, ...(spec.extraPermissions ?? [])],
  plan: Effect.succeed(
    ChangeSet.of(
      ChangeSet.SeedOp.make({
        ownerId: spec.id,
        path: spec.path,
        content: spec.content,
      }),
    ),
  ),
})

/**
 * Build a blueprint from a user-supplied plan Effect. Use this when your plan needs to read
 * existing files, branch on detected state, or compose multiple operations.
 */
export interface ComputedSpec {
  readonly id: string
  readonly version: string
  readonly description?: string
  readonly permissions: readonly Permission.Permission[]
  readonly plan: Effect.Effect<ChangeSet.ChangeSet, Errors.BlueprintError, BlueprintFileSystem>
}

export const computed = (spec: ComputedSpec): Blueprint.Blueprint => ({
  id: spec.id,
  version: spec.version,
  ...StructX.defined("description", spec.description),
  permissions: spec.permissions,
  plan: spec.plan,
})
