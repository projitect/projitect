import { Effect } from "effect"
import { Errors } from "@projitect/core"
import type { ProjitectConfig } from "@projitect/core"
import { computeSplice, resolveSections } from "@projitect/blueprint"
import type { ProjitectPackageMetadata, SectionStrategy } from "@projitect/blueprint"
import { detect, installDev as installDevelopment, readProjitectMetadata } from "../pm.js"
import { splice } from "../edit-pjt.js"
import { parsePackageSpec } from "../package-spec.js"

export interface AddResult {
  readonly pm: string
  readonly pkg: string
  readonly metadata: ProjitectPackageMetadata
  readonly sectionsAdded: readonly string[]
  readonly splicedIntoBlueprintFile: boolean
  /** The user picked no sections (or quit the prompt); `.pjt.ts` was left untouched. */
  readonly selectionCancelled: boolean
}

/**
 * `pjt add <package>` — install a blueprint package and splice it into `.pjt.ts`.
 *
 * Flow:
 *   0. Parse the argument into an install spec and a package name; unsupported specs
 *      (aliases, URLs, tarballs, file, git, workspace, unsafe names) fail with
 *      `pjt.add.spec-unsupported` before anything is installed.
 *   1. Detect package manager (pnpm / yarn / bun / npm).
 *   2. Shell out `<pm> add -D <spec>` with the user's full spec, selector included.
 *   3. Read `node_modules/<name>/package.json` of the installed package for the `"projitect"` metadata
 *      field.
 *      - If present and `type: "blueprint-set"`: section selection resolves per `strategy`
 *        (all / explicit / ask).
 *      - If present and `type: "blueprint"`: a single call line, strategy ignored.
 *      - If absent: fails with `pjt.add.metadata-missing`. The package stays installed; the
 *        message tells the user to import it in `.pjt.ts` by hand and run `pjt remodel`.
 *   4. Splice the import + call lines into `.pjt.ts` between the convention markers
 *      (`pjt:imports` and `pjt:blueprints`).
 */
export const add = <R = never>(params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly pkg: string
  readonly strategy: SectionStrategy<R>
}): Effect.Effect<AddResult, Errors.ProjitectError, R> =>
  Effect.gen(function* () {
    const { installSpec, name } = yield* parsePackageSpec(params.pkg)
    const pm = yield* detect({ projectRoot: params.config.projectRoot })
    yield* installDevelopment({ projectRoot: params.config.projectRoot, pm, pkg: installSpec })
    const metadata = yield* readProjitectMetadata({
      projectRoot: params.config.projectRoot,
      pkg: name,
    })

    if (metadata === null) {
      return yield* new Errors.AddMetadataMissing({
        id: "pjt.add.metadata-missing",
        pkg: name,
        blueprintFile: params.config.blueprintFile,
        message:
          `${name} was installed but has no \`"projitect"\` metadata in its package.json, so \`pjt add\` can't splice it into ${params.config.blueprintFile}. ` +
          `Import it in ${params.config.blueprintFile} by hand, then run \`pjt remodel\`.`,
      })
    }

    const selection = yield* resolveSections({ metadata, strategy: params.strategy })

    if (selection._tag === "Nothing") {
      return {
        pm,
        pkg: name,
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
      pkg: name,
      metadata,
      sectionsAdded,
      splicedIntoBlueprintFile: true,
      selectionCancelled: false,
    }
  })
