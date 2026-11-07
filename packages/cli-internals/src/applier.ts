import { Effect, Match } from "effect"
import { RecordX } from "@nunofyobiz/effect-extras"
import { BlueprintFileSystem } from "@projitect/core"
import type { Errors } from "@projitect/core"
import type { FilePlan, ProjectPlan, RegionPlanFile, MergePlanFile } from "./plan.js"
import { readIfExists } from "./project-file.js"
import { findRegion, renderRegion, upsertRegion } from "./region.js"

/**
 * Apply a plan through the project `BlueprintFileSystem` (which creates parent directories). Used by `pjt remodel` (non-destructive) and `pjt build` (after wiping
 * the project tree). Returns the list of paths actually written.
 */
export const applyPlan = (params: {
  readonly plan: ProjectPlan
}): Effect.Effect<
  readonly string[],
  | Errors.RegionMissingEnd
  | Errors.RegionDuplicate
  | Errors.FsWriteFailed
  | Errors.FsPermissionDenied,
  BlueprintFileSystem
> => {
  const { plan } = params
  return Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const written: string[] = []
    for (const file of plan.files) {
      const current = yield* readIfExists(file.path)
      const next = yield* nextContent({ file, current })
      if (next === null) {
        continue
      } // Seed-mode no-op
      if (next === current) {
        continue
      } // Already in sync
      yield* fs.writeFile(file.path, next)
      written.push(file.path)
    }
    return written
  })
}

const nextContent = (params: {
  readonly file: FilePlan
  readonly current: string | null
}): Effect.Effect<string | null, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Match.valueTags(params.file, {
    Region: (file) => nextRegion(file, params.current),
    Merge: (file) => Effect.succeed(nextMerge(file, params.current)),
    Owned: (file) => Effect.succeed(file.content),
    Seed: (file) => Effect.succeed(params.current === null ? file.content : null),
  })

const nextRegion = (
  file: RegionPlanFile,
  current: string | null,
): Effect.Effect<string, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Effect.gen(function* () {
    let content = current ?? ""
    for (const region of file.regions) {
      const found = yield* findRegion({
        fileContent: content,
        ownerId: region.ownerId,
        commentPrefix: file.commentPrefix,
        commentSuffix: file.commentSuffix,
        path: file.path,
      })
      const rendered = renderRegion({
        ownerId: region.ownerId,
        commentPrefix: file.commentPrefix,
        commentSuffix: file.commentSuffix,
        content: region.content,
      })
      content = upsertRegion({ fileContent: content, existing: found, rendered })
    }
    return content
  })

const nextMerge = (file: MergePlanFile, current: string | null): string => {
  const existing = current === null ? {} : (safeParseJson(current) ?? {})
  const merged = RecordX.deepMerge(existing, file.value)
  return `${JSON.stringify(merged, null, 2)}\n`
}

const safeParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
