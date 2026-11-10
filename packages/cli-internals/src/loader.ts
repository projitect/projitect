import path from "node:path"
import { promises as fs } from "node:fs"
import { pathToFileURL } from "node:url"
import { Array, Effect, Match, Predicate, Schema } from "effect"
import { PredicateX, StructX } from "@nunofyobiz/effect-extras"
import { Errors, Permission } from "@projitect/core"
import type { BlueprintFileSystem, Blueprint } from "@projitect/core"
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
 * It's an identity tag. The loader validates the literal tree without running its Effects.
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

/**
 * Dynamic-import the user's `.pjt.ts` and return the typed default export.
 *
 * The user's file is TypeScript. On Node 23.6+ with `--experimental-strip-types`, the import
 * succeeds natively. On older Node, the binary shim in `packages/projitect` registers `tsx` as
 * a loader before reaching this function. Either way, by the time we get here, `import(path)`
 * Just Works.
 */
export const loadBlueprintFile = (params: {
  readonly blueprintFile: string
  readonly projectRoot: string
}): Effect.Effect<
  ProjitectFile,
  Errors.LoaderImportFailed | Errors.LoaderInvalidDefaultExport | Errors.ConfigBlueprintFileNotFound
> => {
  const { blueprintFile, projectRoot } = params
  const full = path.resolve(projectRoot, blueprintFile)
  return Effect.gen(function* () {
    const exists = yield* Effect.promise(() =>
      fs.access(full).then(
        () => true,
        () => false,
      ),
    )
    if (!exists) {
      return yield* new Errors.ConfigBlueprintFileNotFound({
        id: "pjt.config.blueprint-file-not-found",
        blueprintFile,
        message: `No blueprint file found at ${full}. Run \`pjt init\` to create one.`,
      })
    }
    const module_ = yield* Effect.tryPromise({
      try: (): Promise<{ readonly default?: unknown }> => import(pathToFileURL(full).href),
      catch: (e) =>
        new Errors.LoaderImportFailed({
          id: "pjt.loader.import-failed",
          blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Failed to import ${blueprintFile}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    })
    const value = module_.default
    if (!isProjitectFile(value)) {
      return yield* new Errors.LoaderInvalidDefaultExport({
        id: "pjt.loader.invalid-default-export",
        blueprintFile,
        received: describe(value),
        message: `${blueprintFile} must \`export default pjt({...})\`. Received ${describe(value)}.`,
      })
    }
    return value
  })
}

const isProjitectFile = (v: unknown): v is ProjitectFile =>
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

const describe = (v: unknown): string =>
  Match.value(v).pipe(
    Match.when(Predicate.isUndefined, () => "undefined"),
    Match.when(Predicate.isNull, () => "null"),
    Match.when(Array.isArray, () => "Array"),
    Match.when(PredicateX.unsafeIsRecord, () => "object with an invalid configuration shape"),
    Match.orElse((value) => typeof value),
  )
