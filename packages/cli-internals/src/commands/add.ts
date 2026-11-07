import { Effect } from "effect"
import type { Errors, ProjitectConfig } from "@projitect/core"
import { computeSplice, resolveSections } from "@projitect/blueprint"
import type { ProjitectPackageMetadata, SectionStrategy } from "@projitect/blueprint"
import { detect, installDev as installDevelopment, readProjitectMetadata } from "../pm.js"
import { splice } from "../edit-pjt.js"

export interface AddResult {
  readonly pm: string
  readonly pkg: string
  readonly metadata: ProjitectPackageMetadata | null
  readonly sectionsAdded: readonly string[]
  readonly splicedIntoBlueprintFile: boolean
  /** The user picked no sections (or quit the prompt); `.pjt.ts` was left untouched. */
  readonly selectionCancelled: boolean
}

/**
 * `pjt add <package>` — install a blueprint package and splice it into `.pjt.ts`.
 *
 * Flow:
 *   1. Detect package manager (pnpm / yarn / bun / npm).
 *   2. Shell out `<pm> add -D <package>`.
 *   3. Read the installed package's `package.json` for the `"projitect"` metadata field.
 *      - If present and `type: "blueprint-set"`: section selection resolves per `strategy`
 *        (all / explicit / ask).
 *      - If present and `type: "blueprint"`: a single call line, strategy ignored.
 *      - If absent: install-only behavior. The caller (dispatcher) prints a hint about editing
 *        `.pjt.ts` by hand.
 *   4. Splice the import + call lines into `.pjt.ts` between the convention markers
 *      (`pjt:imports` and `pjt:blueprints`).
 */
export const add = <R = never>(params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly pkg: string
  readonly strategy: SectionStrategy<R>
}): Effect.Effect<AddResult, Errors.ProjitectError, R> =>
  Effect.gen(function* () {
    const pm = yield* detect({ projectRoot: params.config.projectRoot })
    yield* installDevelopment({ projectRoot: params.config.projectRoot, pm, pkg: params.pkg })
    const metadata = yield* readProjitectMetadata({
      projectRoot: params.config.projectRoot,
      pkg: params.pkg,
    })

    if (metadata === null) {
      return {
        pm,
        pkg: params.pkg,
        metadata: null,
        sectionsAdded: [],
        splicedIntoBlueprintFile: false,
        selectionCancelled: false,
      }
    }

    const selection = yield* resolveSections({ metadata, strategy: params.strategy })

    if (selection._tag === "Nothing") {
      return {
        pm,
        pkg: params.pkg,
        metadata,
        sectionsAdded: [],
        splicedIntoBlueprintFile: false,
        selectionCancelled: true,
      }
    }

    const { importLine, callLines, sectionsAdded } = computeSplice({ metadata, selection })

    yield* splice({
      projectRoot: params.config.projectRoot,
      blueprintFile: params.config.blueprintFile,
      importLine,
      callLines,
    })

    return {
      pm,
      pkg: params.pkg,
      metadata,
      sectionsAdded,
      splicedIntoBlueprintFile: true,
      selectionCancelled: false,
    }
  })
