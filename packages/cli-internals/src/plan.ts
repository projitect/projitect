import { Array, Data, Effect, Match, Option, Record, Result, Schema, pipe } from "effect"
import type { Layer } from "effect"
import { NonNullableX, PredicateX, RecordX, StructX } from "@nunofyobiz/effect-extras"
import { ChangeSet, Errors, PjtLock } from "@projitect/core"
import type { Blueprint, BlueprintFileSystem, Permission } from "@projitect/core"
import { isDirectoryBlueprint } from "@projitect/blueprint"
import type { DirectoryBlueprint } from "@projitect/blueprint"
import {
  checkWriteCoverage,
  minimalKeys,
  overlaps,
  reconcileOwnership,
  writtenFields,
} from "./merge-ownership.js"

// ---------------------------------------------------------------------------
// File-level plan shape (after reducing all blueprints' ChangeSets per path)
// ---------------------------------------------------------------------------

export type FilePlan = Data.TaggedEnum<{
  readonly Region: {
    readonly path: string
    readonly commentPrefix: string
    /** Optional closing delimiter for HTML/MDX comments. Empty for `#`/`//`-style regions. */
    readonly commentSuffix: string
    readonly regions: readonly { readonly ownerId: string; readonly content: string }[]
  }
  readonly Merge: {
    readonly path: string
    readonly value: unknown
    /** Minimal dotted-key → ownerId. Overlapping keys of distinct owners are caught at reduction time. */
    readonly ownership: ReadonlyMap<string, string>
  }
  readonly Owned: { readonly path: string; readonly ownerId: string; readonly content: string }
  readonly Seed: { readonly path: string; readonly ownerId: string; readonly content: string }
}>
export const FilePlan = Data.taggedEnum<FilePlan>()

export type RegionPlanFile = Extract<FilePlan, { readonly _tag: "Region" }>
export type MergePlanFile = Extract<FilePlan, { readonly _tag: "Merge" }>
export type OwnedPlanFile = Extract<FilePlan, { readonly _tag: "Owned" }>
export type SeedPlanFile = Extract<FilePlan, { readonly _tag: "Seed" }>

/**
 * A post-apply command declared by a blueprint's `Exec` op, with the declaring blueprint's
 * permissions so the final phase can check it before anything starts. Listed in tree order, then
 * op order; duplicates are kept here and collapsed when the phase runs.
 */
export interface PlannedCommand {
  readonly ownerId: string
  readonly command: string
  /** The op's check command; carried for `pjt inspect`, never run by build or remodel. */
  readonly check?: string
  readonly permissions: readonly Permission.Permission[]
}

export interface ProjectPlan {
  readonly files: readonly FilePlan[]
  readonly commands: readonly PlannedCommand[]
}

/** Every operation that targets a file path; `Exec` is the one that does not. */
type FileOperation = Exclude<ChangeSet.Operation, ChangeSet.ExecOp>

/**
 * Per-blueprint lockfile entries, derived from the same ops that fed the plan. Written to
 * `.pjt.lock` after every successful apply.
 */
export type ByBlueprint = Readonly<Record<string, PjtLock.BlueprintLockEntry>>

/**
 * Removal computed by diffing the previous lockfile against the current `byBlueprint` map.
 * A blueprint that appears in the previous lockfile but not in the current map is "left the
 * tree"; each of its prior operations becomes a removal target.
 */
export interface UpgradeRecord {
  readonly blueprintId: string
  readonly from: string
  readonly to: string
}

// ---------------------------------------------------------------------------
// Flatten the tree (directory wrapping, sequence implicit via array order)
// ---------------------------------------------------------------------------

type RawTree = readonly (Blueprint.Blueprint | DirectoryBlueprint)[]

interface FlatBlueprint {
  readonly blueprint: Blueprint.Blueprint
  readonly directoryPrefix: string
}

const flattenTree = (tree: RawTree, prefix: string): readonly FlatBlueprint[] =>
  Array.flatMap(tree, (node) =>
    isDirectoryBlueprint(node)
      ? flattenTree(node.children, prefix === "" ? node.name : `${prefix}/${node.name}`)
      : [{ blueprint: node, directoryPrefix: prefix }],
  )

// ---------------------------------------------------------------------------
// Run each blueprint's plan Effect with its own permission-gated FS layer,
// collect operations, and reduce them into a ProjectPlan + per-blueprint lockfile entries
// ---------------------------------------------------------------------------

const rebasePath = (prefix: string, p: string): string => (prefix ? `${prefix}/${p}` : p)

const rebaseOp = (prefix: string, op: ChangeSet.Operation): ChangeSet.Operation => {
  // An Exec op has no path, and its command always runs from the project root.
  if (!prefix || op._tag === "Exec") {
    return op
  }
  return {
    ...op,
    path: rebasePath(prefix, op.path),
    ...(op._tag === "Owned"
      ? StructX.defined(
          "ownedDir",
          op.ownedDir === undefined ? undefined : rebasePath(prefix, op.ownedDir),
        )
      : {}),
  }
}

interface AttributedOp {
  readonly blueprintId: string
  readonly blueprintVersion: string
  readonly permissions: readonly Permission.Permission[]
  readonly op: ChangeSet.Operation
}

interface AttributedFileOp extends AttributedOp {
  readonly op: FileOperation
}

interface AttributedExecOp extends AttributedOp {
  readonly op: ChangeSet.ExecOp
}

const asFileOp = (attributed: AttributedOp): Result.Result<AttributedFileOp, void> =>
  attributed.op._tag === "Exec"
    ? Result.failVoid
    : Result.succeed({ ...attributed, op: attributed.op })

const asExecOp = (attributed: AttributedOp): Result.Result<AttributedExecOp, void> =>
  attributed.op._tag === "Exec"
    ? Result.succeed({ ...attributed, op: attributed.op })
    : Result.failVoid

/** A merge op declaring a key and its own descendant owns the ancestor alone, in any order. */
const normalizeOwnedKeys = (attributed: AttributedFileOp): AttributedFileOp =>
  attributed.op._tag === "Merge"
    ? { ...attributed, op: { ...attributed.op, ownedKeys: minimalKeys(attributed.op.ownedKeys) } }
    : attributed

/**
 * Builds the permission-gated `BlueprintFileSystem` Layer one blueprint plans against. Injected so
 * the planner itself touches no `node:*`: the CLI passes `makeRealLayer`, a browser passes
 * `makeGatedLayer` over an in-memory filesystem.
 */
export type LayerFor = (config: {
  readonly blueprintId: string
  readonly permissions: readonly Permission.Permission[]
  readonly projectRoot: string
}) => Layer.Layer<BlueprintFileSystem>

/**
 * Build the project plan by running every blueprint, collecting their ops, reducing them with
 * conflict detection, and producing the per-blueprint lockfile entries.
 */
export const buildPlan = (params: {
  readonly tree: RawTree
  readonly projectRoot: string
  readonly layerFor: LayerFor
}): Effect.Effect<
  { readonly plan: ProjectPlan; readonly byBlueprint: ByBlueprint },
  Errors.ProjitectError
> => {
  const { tree, projectRoot, layerFor } = params
  const flat = flattenTree(tree, "")

  return Effect.gen(function* () {
    const attributed = yield* Effect.forEach(flat, ({ blueprint, directoryPrefix }) =>
      blueprint.plan.pipe(
        Effect.provide(
          layerFor({
            blueprintId: blueprint.id,
            permissions: blueprint.permissions,
            projectRoot,
          }),
        ),
        Effect.map((changeSet) =>
          Array.map(
            changeSet.operations,
            (op): AttributedOp => ({
              blueprintId: blueprint.id,
              blueprintVersion: blueprint.version,
              permissions: blueprint.permissions,
              op: rebaseOp(directoryPrefix, op),
            }),
          ),
        ),
      ),
    ).pipe(Effect.map(Array.flatten))

    const fileOps = Array.map(Array.filterMap(attributed, asFileOp), normalizeOwnedKeys)
    const files = yield* reduceOps(Array.map(fileOps, (a) => a.op))
    const commands = Array.map(
      Array.filterMap(attributed, asExecOp),
      (a): PlannedCommand => ({
        ownerId: a.op.ownerId,
        command: a.op.command,
        ...StructX.defined("check", a.op.check),
        permissions: a.permissions,
      }),
    )
    // Exec ops are not recorded in the lockfile: commands re-run on every remodel.
    const byBlueprint = groupByBlueprint(fileOps)
    return { plan: { files: files.files, commands }, byBlueprint }
  })
}

/** A merge claim left in the lockfile by a blueprint whose written fields are unknown (lockfile v1/v2). */
export interface LegacyMergeClaim {
  readonly blueprintId: string
  readonly path: string
  readonly key: string
}

interface Departure {
  readonly blueprintId: string
  readonly op: PjtLock.LockOperation
}

/**
 * Diff the previous lockfile against the current blueprint set. Returns:
 * - `removals`: ops from blueprints present in the lockfile but absent from the current tree,
 *   plus owned files and merge fields a still-present blueprint no longer ships (a new version
 *   dropping them). A removed merge op carries the fields to delete in `writtenPaths`: what the
 *   blueprint wrote, minus anything a live claim from another blueprint covers. The applier
 *   deletes the matching regions / merge fields / owned files in a follow-up step.
 * - `legacyMergeClaims`: the keys of removed merge ops recorded before lockfile v3, which have no
 *   `writtenPaths`; whether each one is safe to delete depends on the file, so `remodel` checks
 *   them before it writes anything.
 * - `upgrades`: blueprints present in both, with different versions. Informational only — the
 *   actual content is regenerated from the current blueprint, so applying handles upgrade
 *   content automatically; this list is for `inspect`'s human output.
 */
export const diffLockfile = (params: {
  readonly previous: PjtLock.PjtLock | null
  readonly current: ByBlueprint
}): {
  readonly removals: readonly PjtLock.LockOperation[]
  readonly legacyMergeClaims: readonly LegacyMergeClaim[]
  readonly upgrades: readonly UpgradeRecord[]
} => {
  const { previous, current } = params
  return NonNullableX.match(previous, {
    whenNullable: () => ({
      removals: Array.empty<PjtLock.LockOperation>(),
      legacyMergeClaims: Array.empty<LegacyMergeClaim>(),
      upgrades: Array.empty<UpgradeRecord>(),
    }),
    whenNotNullable: (lock) => {
      const entries = Record.toEntries(lock.blueprints)
      const livePaths = new Set(
        Array.flatMap(Record.values(current), (live) =>
          Array.map(live.operations, (op) => op.path),
        ),
      )
      // A blueprint's own live claim never protects what it stopped writing: only the others' do.
      const claimsOfOthers = (blueprintId: string): readonly PjtLock.LockMergeOp[] =>
        Array.filterMap(
          Array.flatMap(
            Record.values(Record.filter(current, (_, id) => id !== blueprintId)),
            (live) => live.operations,
          ),
          asLockMergeOp,
        )
      const departures = Array.flatMap(entries, ([id, prior]): readonly Departure[] =>
        Array.map(
          Option.match(Record.get(current, id), {
            onNone: () => prior.operations,
            onSome: (live) => [...droppedOwnedOps(prior, live), ...droppedMergeOps(prior, live)],
          }),
          (op) => ({ blueprintId: id, op }),
        ),
      )
      const surviving = Array.filterMap(
        departures,
        ({ blueprintId, op }): Result.Result<Departure, void> =>
          Match.valueTags(op, {
            Region: (region) => Result.succeed({ blueprintId, op: region }),
            Seed: (seed) => Result.succeed({ blueprintId, op: seed }),
            // A path some blueprint still plans (e.g. reassigned to another owner) is not an orphan.
            Owned: (owned) =>
              livePaths.has(owned.path)
                ? Result.failVoid
                : Result.succeed({ blueprintId, op: owned }),
            Merge: (merge) =>
              Result.map(withoutLiveKeys(merge, claimsOfOthers(blueprintId)), (kept) => ({
                blueprintId,
                op: kept,
              })),
          }),
      )
      const removals = Array.map(surviving, (departure) => departure.op)
      const legacyMergeClaims = Array.flatMap(surviving, ({ blueprintId, op }) =>
        op._tag === "Merge" && op.writtenPaths === undefined
          ? Array.map(op.ownedKeys, (key) => ({ blueprintId, path: op.path, key }))
          : Array.empty<LegacyMergeClaim>(),
      )
      const upgrades = Array.flatMap(entries, ([id, prior]) =>
        Record.get(current, id).pipe(
          Option.filter((live) => live.version !== prior.version),
          Option.map((live) => [{ blueprintId: id, from: prior.version, to: live.version }]),
          Option.getOrElse(() => Array.empty<UpgradeRecord>()),
        ),
      )
      return { removals, legacyMergeClaims, upgrades }
    },
  })
}

const asLockMergeOp = (op: PjtLock.LockOperation): Result.Result<PjtLock.LockMergeOp, void> =>
  op._tag === "Merge" ? Result.succeed(op) : Result.failVoid

/**
 * A departing merge claim minus every key that equals, contains or sits inside a key some other
 * blueprint still claims on the same file: those belong to the live owner now, so removal never
 * reaches them. A v3 claim narrows its `writtenPaths` the same way; a legacy claim narrows its
 * `ownedKeys`. Nothing left to remove drops the op.
 */
const withoutLiveKeys = (
  op: PjtLock.LockMergeOp,
  liveClaims: readonly PjtLock.LockMergeOp[],
): Result.Result<PjtLock.LockMergeOp, void> => {
  const liveKeys = pipe(
    liveClaims,
    Array.filter((live) => live.path === op.path),
    Array.flatMap((live) => live.ownedKeys),
  )
  const unclaimed = (keys: readonly string[]): readonly string[] =>
    Array.filter(keys, (key) => !Array.some(liveKeys, (liveKey) => overlaps(key, liveKey)))
  return Option.match(Option.fromUndefinedOr(op.writtenPaths), {
    onNone: () => {
      const ownedKeys = unclaimed(op.ownedKeys)
      return Array.isReadonlyArrayNonEmpty(ownedKeys)
        ? Result.succeed(PjtLock.LockMergeOp.make({ path: op.path, ownedKeys }))
        : Result.failVoid
    },
    onSome: (written) => {
      const writtenPaths = unclaimed(written)
      return Array.isReadonlyArrayNonEmpty(writtenPaths)
        ? Result.succeed(PjtLock.LockMergeOp.make({ ...op, writtenPaths }))
        : Result.failVoid
    },
  })
}

/** Owned files the prior lock entry had but the live entry no longer plans. */
const droppedOwnedOps = (
  prior: PjtLock.BlueprintLockEntry,
  live: PjtLock.BlueprintLockEntry,
): readonly PjtLock.LockOperation[] =>
  Array.filter(
    prior.operations,
    (op) => op._tag === "Owned" && !Array.some(live.operations, (l) => l.path === op.path),
  )

/**
 * Merge fields the prior lock entry recorded as written that the live entry no longer writes. A
 * field the live entry writes at, above or below it is not dropped: the deep merge already replaced
 * it (a scalar becoming an object, an object becoming a scalar), so deleting it would delete what
 * the live entry just wrote.
 */
const droppedMergeOps = (
  prior: PjtLock.BlueprintLockEntry,
  live: PjtLock.BlueprintLockEntry,
): readonly PjtLock.LockOperation[] =>
  Array.filterMap(prior.operations, (op) => {
    const liveWritten = pipe(
      live.operations,
      Array.filterMap(asLockMergeOp),
      Array.filter((l) => l.path === op.path),
      Array.flatMap((l) => l.writtenPaths ?? []),
    )
    return op._tag === "Merge" && op.writtenPaths !== undefined
      ? Result.succeed(
          PjtLock.LockMergeOp.make({
            ...op,
            writtenPaths: Array.filter(
              op.writtenPaths,
              (field) => !Array.some(liveWritten, (written) => overlaps(field, written)),
            ),
          }),
        )
      : Result.failVoid
  })

const groupByBlueprint = (attributed: readonly AttributedFileOp[]): ByBlueprint =>
  Record.map(
    Array.groupBy(attributed, (a) => a.blueprintId),
    (group): PjtLock.BlueprintLockEntry => ({
      version: Array.headNonEmpty(group).blueprintVersion,
      operations: Array.map(group, (a) => toLockOp(a.op)),
    }),
  )

const toLockOp = (op: FileOperation): PjtLock.LockOperation =>
  Match.valueTags(op, {
    Region: (region) =>
      PjtLock.LockRegionOp.make({
        path: region.path,
        ownerId: region.ownerId,
        commentPrefix: region.commentPrefix,
        // Only record commentSuffix when non-empty — empty/absent decode the same per the schema.
        ...StructX.defined(
          "commentSuffix",
          PredicateX.isNonEmptyString(region.commentSuffix) ? region.commentSuffix : undefined,
        ),
      }),
    Merge: (merge) =>
      PjtLock.LockMergeOp.make({
        path: merge.path,
        ownedKeys: merge.ownedKeys,
        writtenPaths: writtenFields(merge.value),
      }),
    Owned: (owned) =>
      PjtLock.LockOwnedOp.make({
        path: owned.path,
        ownerId: owned.ownerId,
        ...StructX.defined("ownedDir", owned.ownedDir),
      }),
    Seed: (seed) => PjtLock.LockSeedOp.make({ path: seed.path, ownerId: seed.ownerId }),
  })

// ---------------------------------------------------------------------------
// Reduce raw ops into a ProjectPlan, detecting conflicts as we go
// ---------------------------------------------------------------------------

const reduceOps = (
  ops: readonly FileOperation[],
): Effect.Effect<Pick<ProjectPlan, "files">, Errors.PlanError> =>
  pipe(
    Array.groupBy(ops, (op) => op.path),
    Record.toEntries,
    Effect.forEach(([path, group]) => reduceGroup(path, group)),
    Effect.map((files) => ({ files })),
  )

/** Closing sentence of every plan-conflict message: the command-level way out. */
const conflictNextStep =
  "Remove one of the conflicting blueprints from `.pjt.ts`, then run `pjt remodel`."

/**
 * Reduce one path's operations into a single FilePlan. Every op on a path must share an
 * ownership mode (`_tag`); a mixed group is a `pjt.plan.conflict-owned`.
 */
const reduceGroup = (
  path: string,
  group: Array.NonEmptyReadonlyArray<FileOperation>,
): Effect.Effect<FilePlan, Errors.PlanError> => {
  const head = Array.headNonEmpty(group)
  return Array.findFirst(group, (op) => op._tag !== head._tag).pipe(
    Option.match({
      onSome: (offender) =>
        Effect.fail(
          new Errors.PlanConflictOwned({
            id: "pjt.plan.conflict-owned",
            path,
            ownerA: head.ownerId,
            ownerB: offender.ownerId,
            message: `Blueprints ${head.ownerId} (${head._tag}) and ${offender.ownerId} (${offender._tag}) both target ${path} with incompatible modes. ${conflictNextStep}`,
          }),
        ),
      onNone: () =>
        Match.value(head).pipe(
          Match.tag("Region", () =>
            reduceRegion(path, Array.filter(group, Schema.is(ChangeSet.RegionOp))),
          ),
          Match.tag("Merge", () =>
            reduceMerge(path, Array.filter(group, Schema.is(ChangeSet.MergeOp))),
          ),
          Match.tag("Owned", () =>
            reduceSole("owned", path, Array.filter(group, Schema.is(ChangeSet.OwnedOp))),
          ),
          Match.tag("Seed", () =>
            reduceSole("seed", path, Array.filter(group, Schema.is(ChangeSet.SeedOp))),
          ),
          Match.exhaustive,
        ),
    }),
  )
}

const duplicateOwner = (ops: readonly ChangeSet.RegionOp[]): Option.Option<string> =>
  pipe(
    Array.groupBy(ops, (op) => op.ownerId),
    Record.toEntries,
    Array.findFirst(([, claims]) => claims.length > 1),
    Option.map(([ownerId]) => ownerId),
  )

const reduceRegion = (
  path: string,
  ops: readonly ChangeSet.RegionOp[],
): Effect.Effect<FilePlan, Errors.PlanError> =>
  Option.match(duplicateOwner(ops), {
    onSome: (ownerId) =>
      Effect.fail(
        new Errors.PlanConflictRegion({
          id: "pjt.plan.conflict-region",
          path,
          ownerA: ownerId,
          ownerB: ownerId,
          message: `Multiple blueprints share ownerId ${ownerId} for region in ${path}. ${conflictNextStep}`,
        }),
      ),
    onNone: () => {
      // Last-write-wins on comment style — all ops on one file should use the same anyway.
      const style = Array.last(ops).pipe(
        Option.map((op) => ({
          commentPrefix: op.commentPrefix,
          commentSuffix: op.commentSuffix ?? "",
        })),
        Option.getOrElse(() => ({ commentPrefix: "#", commentSuffix: "" })),
      )
      return Effect.succeed(
        FilePlan.Region({
          path,
          commentPrefix: style.commentPrefix,
          commentSuffix: style.commentSuffix,
          regions: Array.map(ops, (op) => ({ ownerId: op.ownerId, content: op.content })),
        }),
      )
    },
  })

const reduceMerge = (
  path: string,
  ops: readonly ChangeSet.MergeOp[],
): Effect.Effect<FilePlan, Errors.PlanError> =>
  Effect.gen(function* () {
    const ownership = yield* reconcileOwnership(path, ops, conflictNextStep)
    yield* Effect.forEach(ops, (op) => checkWriteCoverage(path, op), { discard: true })
    const value = RecordX.deepMergeReducer.combineAll(Array.map(ops, (op) => op.value))
    return FilePlan.Merge({ path, value, ownership })
  })

/** Owned and seed both demand a single owner per path. */
const reduceSole = (
  kind: "owned" | "seed",
  path: string,
  ops: readonly (ChangeSet.OwnedOp | ChangeSet.SeedOp)[],
): Effect.Effect<FilePlan, Errors.PlanError> => {
  const [first, second] = ops
  if (first !== undefined && second !== undefined) {
    return Effect.fail(
      new Errors.PlanConflictOwned({
        id: "pjt.plan.conflict-owned",
        path,
        ownerA: first.ownerId,
        ownerB: second.ownerId,
        message:
          kind === "owned"
            ? `Multiple blueprints claim full ownership of ${path}. ${conflictNextStep}`
            : `Multiple blueprints try to seed ${path}. ${conflictNextStep}`,
      }),
    )
  }
  return first === undefined
    ? Effect.die(new Error(`unreachable: empty ${kind} group for ${path}`))
    : Effect.succeed(
        kind === "owned"
          ? FilePlan.Owned({ path, ownerId: first.ownerId, content: first.content })
          : FilePlan.Seed({ path, ownerId: first.ownerId, content: first.content }),
      )
}
