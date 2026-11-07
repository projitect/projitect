import type { Effect } from "effect"
import { Array, Match, Predicate } from "effect"
import { PredicateX, StructX } from "@nunofyobiz/effect-extras"
import type { Errors, BlueprintFileSystem, Blueprint } from "@projitect/core"
import type { DirectoryBlueprint } from "@projitect/blueprint"

/**
 * The shape `.pjt.ts` produces when the user calls `pjt({ blueprints, config })`. Either an
 * array of blueprints or an Effect that builds the array. The runner unwraps the Effect form
 * inside the planner so blueprint-tree construction itself can be a typed pipeline.
 *
 * The Effect form may fail with any `BlueprintError` and may require `BlueprintFileSystem` —
 * the CLI provides a "config-time" FS layer with broad read permissions before invoking it.
 */
export type BlueprintTree = readonly (Blueprint.Blueprint | DirectoryBlueprint)[]

export interface ProjitectFile {
  readonly _tag: "ProjitectConfig"
  readonly blueprints:
    | BlueprintTree
    | Effect.Effect<BlueprintTree, Errors.BlueprintError, BlueprintFileSystem>
  readonly config?: Record<string, unknown>
}

/**
 * The user calls this in `.pjt.ts`:
 *
 *   export default pjt({ blueprints: [...] })
 *
 * It's an identity tag — we only inspect the default export for the `_tag` marker so we can
 * distinguish accidental other exports from a real projitect config.
 */
export const pjt = (input: {
  readonly blueprints: ProjitectFile["blueprints"]
  readonly config?: Record<string, unknown>
}): ProjitectFile => ({
  _tag: "ProjitectConfig",
  blueprints: input.blueprints,
  ...StructX.defined("config", input.config),
})

/** Type guard: did the user pass an Effect, or a literal array? */
export const isEffectTree = (
  v: ProjitectFile["blueprints"],
): v is Effect.Effect<BlueprintTree, Errors.BlueprintError, BlueprintFileSystem> =>
  !Array.isArray(v)

export const isProjitectFile = (v: unknown): v is ProjitectFile =>
  PredicateX.unsafeIsRecord(v) && v["_tag"] === "ProjitectConfig"

export const describe = (v: unknown): string =>
  Match.value(v).pipe(
    Match.when(Predicate.isUndefined, () => "undefined"),
    Match.when(Predicate.isNull, () => "null"),
    Match.when(Array.isArray, () => "Array"),
    Match.when(PredicateX.unsafeIsRecord, () => 'object without `_tag: "ProjitectConfig"`'),
    Match.orElse((value) => typeof value),
  )
