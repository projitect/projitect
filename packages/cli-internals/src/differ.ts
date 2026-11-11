import { Array, Effect, Match } from "effect"
import type { BlueprintFileSystem, PjtLock, Errors } from "@projitect/core"
import { RecordX } from "@nunofyobiz/effect-extras"
import type { CheckFailure } from "./post-apply.js"
import { readIfExists } from "./project-file.js"
import { findRegion } from "./region.js"
import type {
  FilePlan,
  ProjectPlan,
  RegionPlanFile,
  MergePlanFile,
  OwnedPlanFile,
  SeedPlanFile,
  UpgradeRecord,
  LegacyMergeClaim,
} from "./plan.js"

export interface FileDiff {
  readonly path: string
  /** "create" — file absent, will be created; "modify" — exists but content drifts; "ok" — in sync. */
  readonly status: "create" | "modify" | "ok"
  readonly summary: string
}

export interface PlanDiff {
  readonly files: readonly FileDiff[]
  readonly hasDrift: boolean
}

/**
 * Compare each file in the plan against the project filesystem. Returns a structured diff suitable for either
 * human rendering (`renderPlanDiff`) or machine consumption (`--json`).
 */
export const diffPlan = (params: {
  readonly plan: ProjectPlan
}): Effect.Effect<
  PlanDiff,
  Errors.RegionMissingEnd | Errors.RegionDuplicate,
  BlueprintFileSystem
> => {
  const { plan } = params
  return Effect.gen(function* () {
    const files = yield* Effect.forEach(plan.files, (file) =>
      readIfExists(file.path).pipe(Effect.flatMap((current) => diffFile({ file, current }))),
    )
    const hasDrift = Array.some(files, (file) => file.status !== "ok")
    return { files, hasDrift }
  })
}

const diffFile = (params: {
  readonly file: FilePlan
  readonly current: string | null
}): Effect.Effect<FileDiff, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Match.valueTags(params.file, {
    Region: (file) => diffRegion(file, params.current),
    Merge: (file) => Effect.succeed(diffMerge(file, params.current)),
    Owned: (file) => Effect.succeed(diffOwned(file, params.current)),
    Seed: (file) => Effect.succeed(diffSeed(file, params.current)),
  })

const diffRegion = (
  file: RegionPlanFile,
  current: string | null,
): Effect.Effect<FileDiff, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Effect.gen(function* () {
    if (current === null) {
      return {
        path: file.path,
        status: "create" as const,
        summary: `+ create ${file.path} (${file.regions.length} region${file.regions.length === 1 ? "" : "s"})`,
      }
    }
    const drifted: string[] = []
    for (const region of file.regions) {
      const found = yield* findRegion({
        fileContent: current,
        ownerId: region.ownerId,
        commentPrefix: file.commentPrefix,
        commentSuffix: file.commentSuffix,
        path: file.path,
      })
      const expected = region.content.trimEnd()
      if (found._tag === "Absent") {
        drifted.push(`missing region ${region.ownerId}`)
      } else if (found.content.trimEnd() !== expected) {
        drifted.push(`region ${region.ownerId} content drift`)
      }
    }
    if (drifted.length === 0) {
      return { path: file.path, status: "ok" as const, summary: `  ok ${file.path}` }
    }
    return {
      path: file.path,
      status: "modify" as const,
      summary: `~ modify ${file.path} — ${drifted.join(", ")}`,
    }
  })

const diffMerge = (file: MergePlanFile, current: string | null): FileDiff => {
  if (current === null) {
    return {
      path: file.path,
      status: "create",
      summary: `+ create ${file.path}`,
    }
  }
  try {
    const parsed = JSON.parse(current) as unknown
    const target = RecordX.deepMerge(parsed, file.value)
    if (canonicalJson(parsed) === canonicalJson(target)) {
      return { path: file.path, status: "ok", summary: `  ok ${file.path}` }
    }
    return {
      path: file.path,
      status: "modify",
      summary: `~ modify ${file.path} (JSON merge)`,
    }
  } catch {
    return {
      path: file.path,
      status: "modify",
      summary: `~ modify ${file.path} (unparseable JSON)`,
    }
  }
}

const diffOwned = (file: OwnedPlanFile, current: string | null): FileDiff => {
  if (current === null) {
    return { path: file.path, status: "create", summary: `+ create ${file.path}` }
  }
  if (current === file.content) {
    return { path: file.path, status: "ok", summary: `  ok ${file.path}` }
  }
  return { path: file.path, status: "modify", summary: `~ modify ${file.path}` }
}

const diffSeed = (file: SeedPlanFile, current: string | null): FileDiff => {
  if (current === null) {
    return { path: file.path, status: "create", summary: `+ create ${file.path} (seed)` }
  }
  return { path: file.path, status: "ok", summary: `  ok ${file.path} (seed, never enforced)` }
}

// Stable JSON string for structural comparison: deep key-sort, then stringify.
const canonicalJson = (v: unknown): string => JSON.stringify(RecordX.canonicalize(v))

// ---------------------------------------------------------------------------
// Render a diff for the terminal
// ---------------------------------------------------------------------------

export const renderPlanDiff = (diff: PlanDiff): string => {
  if (!diff.hasDrift) {
    return "Project is in sync with blueprints. No changes needed."
  }
  const lines = diff.files.map((f) => f.summary)
  return lines.join("\n")
}

/**
 * Render the full inspect output: file-diff lines + lockfile-driven removals + version upgrades.
 * Used by `pjt inspect` and `pjt remodel --dry-run` (future) to give a complete picture.
 */
export const renderInspectReport = (params: {
  readonly diff: PlanDiff
  readonly removals: readonly PjtLock.LockOperation[]
  readonly upgrades: readonly UpgradeRecord[]
  readonly commands?: readonly CheckFailure[]
  readonly ambiguousMergeClaims?: readonly LegacyMergeClaim[]
}): string => {
  const { diff, removals, upgrades, commands = [], ambiguousMergeClaims = [] } = params
  const lines = Array.flatten([
    Array.map(upgrades, (u) => `↑ upgrade ${u.blueprintId} ${u.from} → ${u.to}`),
    Array.map(removals, removalSummary),
    Array.map(ambiguousMergeClaims, ambiguousSummary),
    Array.map(diff.files, (f) => f.summary),
    Array.map(commands, checkSummary),
  ])
  if (lines.length === 0) {
    return "Project is in sync with blueprints. No changes needed."
  }
  return lines.join("\n")
}

const checkSummary = (failure: CheckFailure): string => {
  const status = failure.exitCode === undefined ? "could not start" : `exit ${failure.exitCode}`
  const output = [failure.stdout, failure.stderr]
    .map((text) => text.trimEnd())
    .filter((text) => text !== "")
    .map((text) =>
      text
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    )
  return [`! check failed: ${failure.check} (${status})`, ...output].join("\n")
}

const ambiguousSummary = (claim: LegacyMergeClaim): string =>
  `! cannot remove "${claim.key}" from ${claim.path}: ${claim.blueprintId} left .pjt.ts but its lockfile entry predates lockfile v3 and does not say which fields it wrote. Run \`pjt remodel\` with ${claim.blueprintId} still in .pjt.ts to upgrade the lockfile, or delete the key by hand.`

const removalSummary = (op: PjtLock.LockOperation): string =>
  Match.valueTags(op, {
    Region: (region) =>
      `- remove ${region.ownerId} region from ${region.path}   (blueprint left .pjt.ts)`,
    Merge: (merge) =>
      `- remove merge keys ${(merge.writtenPaths ?? merge.ownedKeys).join(", ")} from ${merge.path}   (blueprint left .pjt.ts)`,
    Owned: (owned) => `- delete ${owned.path}   (blueprint left .pjt.ts)`,
    Seed: (seed) =>
      `  (seed ${seed.ownerId} for ${seed.path} retained; blueprint left but seed mode is write-once)`,
  })
