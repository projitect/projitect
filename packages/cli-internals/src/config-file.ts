import { Array, Effect, Match, Predicate, Schema } from "effect"
import { PredicateX, StructX } from "@nunofyobiz/effect-extras"
import type { BlueprintFileSystem, Blueprint, Errors } from "@projitect/core"
import { Permission } from "@projitect/core"
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
 * It's an identity tag. Consumers validate the literal tree without running its Effects.
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
  Effect.isEffect(v)

export const isProjitectFile = (v: unknown): v is ProjitectFile =>
  PredicateX.unsafeIsRecord(v) && v["_tag"] === "ProjitectConfig"

export const isWellFormedProjitectFile = (v: unknown): v is ProjitectFile =>
  PredicateX.unsafeIsRecord(v) &&
  v["_tag"] === "ProjitectConfig" &&
  (Predicate.isUndefined(v["config"]) || PredicateX.unsafeIsRecord(v["config"])) &&
  (Effect.isEffect(v["blueprints"]) || isBlueprintTree(v["blueprints"]))

/** Validate literal structure only. Effects are deliberately evaluated against the post-wipe FS. */
const isBlueprintTree = (
  value: unknown,
  ancestors: ReadonlySet<unknown> = new Set(),
): value is BlueprintTree =>
  Array.isArray(value) &&
  !ancestors.has(value) &&
  [...value].every((entry) => {
    if (!PredicateX.unsafeIsRecord(entry)) {
      return false
    }
    if (Predicate.hasProperty(entry, "_tag")) {
      return (
        entry._tag === "Directory" &&
        Predicate.hasProperty(entry, "name") &&
        Predicate.isString(entry.name) &&
        Predicate.hasProperty(entry, "children") &&
        isBlueprintTree(entry.children, new Set([...ancestors, value]))
      )
    }
    return (
      Predicate.isString(entry["id"]) &&
      Predicate.isString(entry["version"]) &&
      (Predicate.isUndefined(entry["description"]) || Predicate.isString(entry["description"])) &&
      Array.isArray(entry["permissions"]) &&
      [...entry["permissions"]].every(Schema.is(Permission.Permission)) &&
      Effect.isEffect(entry["plan"])
    )
  })

/** Short name for what a `.pjt.ts` default export actually was, for error messages. */
export const describe = (v: unknown): string =>
  Match.value(v).pipe(
    Match.when(Predicate.isUndefined, () => "undefined"),
    Match.when(Predicate.isNull, () => "null"),
    Match.when(Array.isArray, () => "Array"),
    Match.when(PredicateX.unsafeIsRecord, () => 'object without `_tag: "ProjitectConfig"`'),
    Match.orElse((value) => typeof value),
  )
