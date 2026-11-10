import path from "node:path"
import { promises as fs } from "node:fs"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"
import { Errors } from "@projitect/core"
import { describe, isProjitectFile } from "./config-file.js"
import type { ProjitectFile } from "./config-file.js"

export { pjt, isEffectTree } from "./config-file.js"
export type { ProjitectFile, BlueprintTree } from "./config-file.js"

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
