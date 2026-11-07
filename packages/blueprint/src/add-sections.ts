import { Array, Effect, Match } from "effect"
import { Prompt } from "effect/unstable/cli"
import type { Errors } from "@projitect/core"

/**
 * The shape of the `"projitect"` field in a blueprint package's `package.json`. Defines how
 * `pjt add <pkg>` should splice into the user's `.pjt.ts`.
 */
export interface ProjitectPackageMetadata {
  /**
   * `"blueprint"` for single-call packages (e.g. one default export). `"blueprint-set"` for
   * packages that expose multiple sections (e.g. `gitignores.macOs()`, `gitignores.node()`).
   */
  readonly type: "blueprint" | "blueprint-set"
  /** The import statement to splice into `// pjt:imports`, e.g. `import { foo } from "foo"`. */
  readonly import: string
  /** For `type: "blueprint"` only — the call template, e.g. `myBlueprint()`. */
  readonly call?: string
  /** For `type: "blueprint-set"` only — substitute `{section}` with each chosen name. */
  readonly callTemplate?: string
  /** For `type: "blueprint-set"` only — the list of available section names. */
  readonly sections?: readonly string[]
}

/**
 * Strategy for picking which sections of a `blueprint-set` package to splice.
 *
 *   - `"all"` — silent default; pick every section the package declares. Used when the caller
 *     wants the legacy "no --section means everything" behavior.
 *   - `{ kind: "explicit", sections }` — caller already knows. `--section macOs,node` lands here.
 *   - `{ kind: "ask", choose }` — interactive: defer to the supplied callback (typically
 *     `chooseSectionsInteractive`). The callback runs only when the installed package's metadata
 *     says `type: "blueprint-set"` and exposes sections.
 *
 * `R` parametrizes the callback's requirement channel so the caller can hand us an Effect
 * that needs `Prompt.Environment` (FileSystem | Path | Terminal).
 */
export type SectionStrategy<R = never> =
  | { readonly _tag: "All" }
  | { readonly _tag: "Explicit"; readonly sections: readonly string[] }
  | {
      readonly _tag: "Ask"
      readonly choose: (
        metadata: ProjitectPackageMetadata,
      ) => Effect.Effect<readonly string[], Errors.ProjitectError, R>
    }

/**
 * What the user wants spliced from a package. Cancellation is its own case so it can never be
 * mistaken for "all":
 *
 *   - `All` — every declared section.
 *   - `Chosen` — exactly these sections (non-empty).
 *   - `Nothing` — the user picked no sections or quit the prompt; the host must not write.
 */
export type SectionSelection =
  | { readonly _tag: "All" }
  | { readonly _tag: "Chosen"; readonly sections: readonly string[] }
  | { readonly _tag: "Nothing" }

const chosenOr = (sections: readonly string[], whenEmpty: SectionSelection): SectionSelection =>
  Array.isReadonlyArrayNonEmpty(sections) ? { _tag: "Chosen", sections } : whenEmpty

/** Resolve which sections the user wants, per `strategy`. */
export const resolveSections = <R>(params: {
  readonly metadata: ProjitectPackageMetadata
  readonly strategy: SectionStrategy<R>
}): Effect.Effect<SectionSelection, Errors.ProjitectError, R> => {
  const { metadata, strategy } = params
  // Section strategy only matters for blueprint-sets. For `type: "blueprint"` the selection is
  // ignored — `computeSplice` emits a single non-templated call line.
  if (metadata.type === "blueprint") {
    return Effect.succeed({ _tag: "All" })
  }
  return Match.valueTags(strategy, {
    All: () => Effect.succeed<SectionSelection>({ _tag: "All" }),
    Explicit: (explicit) => Effect.succeed(chosenOr(explicit.sections, { _tag: "All" })),
    Ask: (ask) =>
      Effect.map(ask.choose(metadata), (picked) => chosenOr(picked, { _tag: "Nothing" })),
  })
}

/**
 * Compute the import line and call lines to splice for the selection. A `Nothing` selection
 * yields no call lines and no sections; hosts check `selection._tag` and skip the write.
 */
export const computeSplice = (params: {
  readonly metadata: ProjitectPackageMetadata
  readonly selection: SectionSelection
}): {
  readonly importLine: string
  readonly callLines: readonly string[]
  readonly sectionsAdded: readonly string[]
} => {
  const { metadata, selection } = params
  if (metadata.type === "blueprint") {
    const call =
      metadata.call ?? "/* TODO: replace with the blueprint call from the package's README */"
    return {
      importLine: metadata.import,
      callLines: [`${call},`],
      sectionsAdded: [],
    }
  }
  // Blueprint-set
  const allSections = metadata.sections ?? []
  const chosen = Match.value(selection).pipe(
    Match.tag("All", () => allSections),
    Match.tag("Chosen", (picked) => picked.sections.filter((s) => allSections.includes(s))),
    Match.tag("Nothing", () => []),
    Match.exhaustive,
  )
  const template = metadata.callTemplate ?? "{section}()"
  return {
    importLine: metadata.import,
    callLines: chosen.map((s) => `${template.replace("{section}", s)},`),
    sectionsAdded: chosen,
  }
}

/**
 * Interactive section picker for a `type: "blueprint-set"` package. Ctrl-C yields an empty
 * selection rather than crashing; `resolveSections` maps an empty `Ask` result to
 * `Nothing`, so quitting never splices anything.
 *
 * Returns an empty selection if no sections are declared (defensive default — shouldn't happen
 * for well-formed metadata, but we don't want to crash on a malformed package).
 */
export const chooseSectionsInteractive = (
  metadata: ProjitectPackageMetadata,
): Effect.Effect<readonly string[], never, Prompt.Environment> => {
  const sections = metadata.sections ?? []
  if (!Array.isReadonlyArrayNonEmpty(sections)) {
    return Effect.succeed([])
  }
  return Prompt.multiSelect({
    message: "Pick sections to add (space to toggle, enter to confirm):",
    choices: sections.map((name) => ({ title: name, value: name })),
  }).pipe(Effect.catchTag("QuitError", () => Effect.succeed<readonly string[]>([])))
}
