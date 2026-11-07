import { randomUUID } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import type { Scope } from "effect"
import { build } from "esbuild"
import { Errors } from "@projitect/core"

/**
 * Where the plain-JS module the worker imports is written: under the `.pjt.ts`'s own directory, so
 * bare imports resolve from it exactly as they do from the `.pjt.ts`.
 */
const cacheDir = (full: string): string =>
  path.join(path.dirname(full), "node_modules", ".cache", "projitect")

export interface TranspiledModule {
  /** Plain ESM JavaScript the confined worker can import without any loader. */
  readonly moduleFile: string
  /** Bare import specifiers left external — the packages the worker has to be able to read. */
  readonly imports: readonly string[]
}

/**
 * Transpile (and bundle the relative imports of) the user's `.pjt.ts` into plain JavaScript in the
 * parent. Loaders such as `tsx` start a worker thread, which the confined worker is not granted, so
 * the worker only ever imports finished JavaScript. Bare imports stay external, so they resolve from
 * the project's `node_modules` exactly as they would for the `.pjt.ts` itself.
 */
export const transpileBlueprintFile = (params: {
  readonly blueprintFile: string
  readonly full: string
}): Effect.Effect<TranspiledModule, Errors.LoaderImportFailed, Scope.Scope> => {
  const { blueprintFile, full } = params
  const moduleFile = path.join(cacheDir(full), `pjt-config-${randomUUID()}.mjs`)
  return Effect.acquireRelease(
    Effect.tryPromise({
      try: async (): Promise<TranspiledModule> => {
        const result = await build({
          entryPoints: [full],
          outfile: moduleFile,
          bundle: true,
          packages: "external",
          format: "esm",
          platform: "node",
          target: "node22",
          write: false,
          metafile: true,
          logLevel: "silent",
        })
        const outputs = result.outputFiles
        await mkdir(cacheDir(full), { recursive: true })
        await Promise.all(outputs.map((output) => writeFile(output.path, output.contents)))
        const imports = Object.values(result.metafile.outputs).flatMap((output) =>
          output.imports.filter((entry) => entry.external === true).map((entry) => entry.path),
        )
        return { moduleFile, imports }
      },
      catch: (e) =>
        new Errors.LoaderImportFailed({
          id: "pjt.loader.import-failed",
          blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Failed to import ${blueprintFile}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    }),
    () => Effect.promise(() => rm(moduleFile, { force: true })),
  )
}
