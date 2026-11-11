import { cp, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Array, Effect, Option } from "effect"
import type { Scope } from "effect"
import { Errors } from "@projitect/core"
import { dependencyNames, findPackageDir, packageNameOf, workerPackageRoots } from "./allowlist.js"

export interface StagedModule {
  /** The directory the worker may read in full: the staged module and its private package graph. */
  readonly stageDir: string
  /** The transpiled `.pjt.ts`, inside {@link StagedModule.stageDir}. */
  readonly moduleFile: string
}

/**
 * Resolve `name` the way Node would from each of `fromDirs`, first hit wins. Misses are fine: a
 * dependency the installation does not have is simply not staged.
 */
const locate = (name: string, fromDirs: readonly string[]): string | undefined => {
  for (const from of fromDirs) {
    const found = findPackageDir(name, from)
    if (found._tag === "Some") {
      return found.value.real
    }
  }
  return undefined
}

const linkInto = async (nodeModules: string, name: string, target: string): Promise<void> => {
  const link = path.join(nodeModules, name)
  await mkdir(path.dirname(link), { recursive: true })
  await symlink(target, link, "dir")
}

/**
 * Build the worker's private package graph under a fresh directory: one copy of each canonical
 * package instance the `.pjt.ts` pulls in (own files only, never a `node_modules`), wired to its
 * resolved dependencies and peers by symlinks beside it. The worker is granted this directory — and
 * nothing around the originals — so a name that prefixes an unimported sibling's cannot widen the
 * grant, and `require` can stat the `node_modules` directories it walks. Packages the worker itself
 * runs on (`effect`, core, the SDK) stay where they are and are linked to, so blueprint code and the
 * worker share one instance of them.
 */
export const stageBlueprintModule = (params: {
  readonly workerEntry: string
  readonly moduleFile: string
  readonly imports: readonly string[]
  readonly resolveFrom: readonly string[]
}): Effect.Effect<StagedModule, Errors.LoaderImportFailed, Scope.Scope> => {
  const { workerEntry, moduleFile, imports, resolveFrom } = params
  const build = async (stageDir: string): Promise<StagedModule> => {
    const shared = workerPackageRoots(workerEntry)
    const staged = new Map<string, string>()
    const pending: Promise<void>[] = []
    let counter = 0
    // Claims the staged location of a canonical package instance — the same one every time — and
    // queues copying it and wiring its dependencies, which may come back to it (cycles).
    const stage = (real: string, name: string): string => {
      const existing = staged.get(real)
      if (existing !== undefined) {
        return existing
      }
      if (shared.has(real)) {
        staged.set(real, real)
        return real
      }
      const home = path.join(stageDir, "pkgs", String(counter++))
      const copy = path.join(home, "node_modules", name)
      staged.set(real, copy)
      pending.push(
        cp(real, copy, {
          recursive: true,
          verbatimSymlinks: true,
          filter: (source) => source !== path.join(real, "node_modules"),
        }).then(() =>
          Promise.all(
            Array.flatMap(dependencyNames(real), (dependency) =>
              Option.toArray(
                Option.fromNullishOr(locate(dependency, [real])).pipe(
                  Option.map((found) =>
                    linkInto(path.join(home, "node_modules"), dependency, stage(found, dependency)),
                  ),
                ),
              ),
            ),
          ).then(() => undefined),
        ),
      )
      return copy
    }
    const drain = async (): Promise<void> => {
      const batch = pending.splice(0)
      if (batch.length > 0) {
        await Promise.all(batch)
        await drain()
      }
    }
    const entryDir = path.join(stageDir, "entry")
    await mkdir(entryDir, { recursive: true })
    const stagedModule = path.join(entryDir, path.basename(moduleFile))
    await cp(moduleFile, stagedModule)
    const names = Array.dedupe(
      Array.flatMap(imports, (specifier) => Option.toArray(packageNameOf(specifier))),
    )
    await Promise.all(
      Array.flatMap(names, (name) =>
        Option.toArray(
          Option.fromNullishOr(locate(name, resolveFrom)).pipe(
            Option.map((found) =>
              linkInto(path.join(entryDir, "node_modules"), name, stage(found, name)),
            ),
          ),
        ),
      ),
    )
    await drain()
    return { stageDir, moduleFile: stagedModule }
  }
  return Effect.acquireRelease(
    Effect.tryPromise({
      try: async (): Promise<StagedModule> => {
        const stageDir = await realpath(await mkdtemp(path.join(tmpdir(), "pjt-worker-")))
        return build(stageDir).catch(async (error: unknown) => {
          await rm(stageDir, { recursive: true, force: true })
          throw error
        })
      },
      catch: (e) =>
        new Errors.LoaderImportFailed({
          id: "pjt.loader.import-failed",
          blueprintFile: moduleFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Failed to stage the packages for ${moduleFile}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    }),
    (stagedModule) =>
      Effect.promise(() => rm(stagedModule.stageDir, { recursive: true, force: true })),
  )
}
