import { Array, Data, Effect, Match, Option, Predicate, Record, Result } from "effect"
import { PredicateX } from "@nunofyobiz/effect-extras"
import { transform } from "sucrase"
import type { BlueprintFileSystem, Errors } from "@projitect/core"
import { describe, isEffectTree, isProjitectFile } from "./config-file.js"
import type { BlueprintTree, ProjitectFile } from "./config-file.js"

/**
 * Evaluates `.pjt.ts` text in the browser. The CLI loader leans on native TypeScript stripping or
 * `tsx`, neither of which a browser has, so the editor text is transpiled with `sucrase` (types
 * stripped, `import`/`export` rewritten to CommonJS) and run with a `require` that resolves only
 * the specifiers in a caller-supplied registry — `@projitect/cli-internals/browser-blueprints`
 * ships one holding the first-party blueprint packages.
 *
 * Not a security sandbox: this executes the text as JavaScript in the calling realm, and the registry
 * only limits what `import` resolves. Evaluate only text the user wrote in their own tab; a host that
 * evaluates untrusted or shared snippets must isolate them (a sandboxed iframe or a Worker). `sucrase` strips
 * types without checking them, so only syntax and runtime failures surface here.
 */
export type ModuleRegistry = Readonly<Record<string, unknown>>

/** Why a `.pjt.ts` could not be evaluated. Each variant carries a ready-to-show `message`. */
export type PjtEvalFailure = Data.TaggedEnum<{
  /** The text does not parse; `line` / `column` are 1-based when the parser reported them. */
  readonly Syntax: { readonly message: string; readonly line?: number; readonly column?: number }
  /** An `import` names a module absent from the registry. */
  readonly UnknownImport: { readonly specifier: string; readonly message: string }
  /** Top-level code threw while running. */
  readonly Runtime: { readonly message: string }
  /** The default export is not `pjt({...})`. */
  readonly InvalidDefaultExport: { readonly received: string; readonly message: string }
}>
export const PjtEvalFailure = Data.taggedEnum<PjtEvalFailure>()

class UnknownImportSignal extends Error {
  constructor(readonly specifier: string) {
    super(`Cannot find module "${specifier}"`)
  }
}

const syntaxFailure = (cause: unknown): PjtEvalFailure => {
  const loc: { readonly line?: number; readonly column?: number } =
    typeof cause === "object" && cause !== null && "loc" in cause && typeof cause.loc === "object"
      ? { ...cause.loc }
      : {}
  return PjtEvalFailure.Syntax({
    message: cause instanceof Error ? cause.message : String(cause),
    ...(loc.line === undefined ? {} : { line: loc.line }),
    ...(loc.column === undefined ? {} : { column: loc.column }),
  })
}

const runFailure = (registry: ModuleRegistry, cause: unknown): PjtEvalFailure =>
  cause instanceof UnknownImportSignal
    ? PjtEvalFailure.UnknownImport({
        specifier: cause.specifier,
        message: `Cannot import "${cause.specifier}" in the browser. Available: ${Record.keys(registry).join(", ")}.`,
      })
    : PjtEvalFailure.Runtime({ message: cause instanceof Error ? cause.message : String(cause) })

const execute = (code: string, registry: ModuleRegistry): Result.Result<unknown, PjtEvalFailure> =>
  Result.try({
    try: () => {
      const module_: { exports: { default?: unknown } } = { exports: {} }
      const require = (specifier: string): unknown =>
        Option.getOrThrowWith(
          Record.get(registry, specifier),
          () => new UnknownImportSignal(specifier),
        )
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- evaluating the user's own `.pjt.ts` is this module's purpose
      Reflect.apply(new Function("exports", "require", "module", code), undefined, [
        module_.exports,
        require,
        module_,
      ])
      return module_.exports.default
    },
    catch: (cause) => runFailure(registry, cause),
  })

const isBlueprint = (v: unknown): boolean =>
  PredicateX.unsafeIsRecord(v) &&
  Predicate.isString(v["id"]) &&
  Predicate.isString(v["version"]) &&
  Array.isArray(v["permissions"]) &&
  Effect.isEffect(v["plan"])

/** A blueprint, or a `directory(...)` node whose children are all valid in turn. */
const isTreeNode = (v: unknown): boolean =>
  PredicateX.unsafeIsRecord(v) && v["_tag"] === "Directory"
    ? Predicate.isString(v["name"]) && isBlueprintList(v["children"])
    : isBlueprint(v)

const isBlueprintList = (v: unknown): boolean => Array.isArray(v) && Array.every(v, isTreeNode)

/**
 * `isProjitectFile` only checks the `_tag`; the evaluator also needs `blueprints` to be a
 * well-formed list or an Effect, or `blueprintTree` would hand back something that is not a tree.
 */
const isWellFormedFile = (v: unknown): v is ProjitectFile =>
  isProjitectFile(v) &&
  (Effect.isEffect(v.blueprints) || isBlueprintList(v.blueprints)) &&
  (v.config === undefined || PredicateX.unsafeIsRecord(v.config))

const describeInvalid = (v: unknown): string =>
  isProjitectFile(v)
    ? "a pjt({...}) whose `blueprints` is not an array of blueprints (or `directory(...)` nodes) or an Effect, or whose `config` is not an object"
    : describe(v)

/**
 * Turn `.pjt.ts` text into its `pjt({...})` result. Never throws: a syntax error, an import the
 * registry lacks, a throwing top level or a wrong default export all come back as a
 * `PjtEvalFailure`.
 */
export const evaluatePjt = (
  source: string,
  registry: ModuleRegistry,
): Result.Result<ProjitectFile, PjtEvalFailure> =>
  Result.try({
    try: () => transform(source, { transforms: ["typescript", "imports"] }).code,
    catch: syntaxFailure,
  }).pipe(
    Result.flatMap((code) => execute(code, registry)),
    Result.flatMap((value) =>
      Match.value(value).pipe(
        Match.when(isWellFormedFile, (file) => Result.succeed(file)),
        Match.orElse((other) =>
          Result.fail(
            PjtEvalFailure.InvalidDefaultExport({
              received: describeInvalid(other),
              message: `.pjt.ts must \`export default pjt({...})\`. Received ${describeInvalid(other)}.`,
            }),
          ),
        ),
      ),
    ),
  )

/**
 * The blueprint list of an evaluated file: the literal array as-is, or the result of running the
 * Effect form, which may read the project through `BlueprintFileSystem`.
 */
export const blueprintTree = (
  file: ProjitectFile,
): Effect.Effect<BlueprintTree, Errors.BlueprintError, BlueprintFileSystem> =>
  isEffectTree(file.blueprints) ? file.blueprints : Effect.succeed(file.blueprints)
