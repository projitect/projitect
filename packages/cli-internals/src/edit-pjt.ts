import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { Errors } from "@projitect/core"
import { spliceBlueprintFile } from "@projitect/blueprint"

export interface SpliceParams {
  readonly projectRoot: string
  readonly blueprintFile: string
  /** Import statement to splice (one line, no trailing newline). Deduped. */
  readonly importLine: string
  /** Blueprint call lines (one entry per line, no leading indent, no trailing newline). */
  readonly callLines: readonly string[]
}

/**
 * Read `.pjt.ts`, splice an import and call lines in via the shared `spliceBlueprintFile`, and
 * write it back. The marker convention and splice behavior live in `@projitect/blueprint`.
 *
 * Fails with `pjt.add.markers-missing` if either marker pair is missing — the user has
 * hand-edited the file and we won't guess. They restore the markers, then re-run `pjt add`.
 */
export const splice = (
  params: SpliceParams,
): Effect.Effect<void, Errors.AddMarkersMissing | Errors.FsReadFailed | Errors.FsWriteFailed> =>
  Effect.gen(function* () {
    const full = path.join(params.projectRoot, params.blueprintFile)
    const raw = yield* Effect.tryPromise({
      try: () => fs.readFile(full, "utf8"),
      catch: (e) =>
        new Errors.FsReadFailed({
          id: "pjt.fs.read-failed",
          path: params.blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Could not read ${params.blueprintFile}`,
        }),
    })

    const next = yield* spliceBlueprintFile({
      content: raw,
      blueprintFile: params.blueprintFile,
      importLine: params.importLine,
      callLines: params.callLines,
    })

    yield* Effect.tryPromise({
      try: () => fs.writeFile(full, next, "utf8"),
      catch: (e) =>
        new Errors.FsWriteFailed({
          id: "pjt.fs.write-failed",
          path: params.blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Could not write ${params.blueprintFile}`,
        }),
    })
  })
