import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import type { Terminal } from "effect"
import { Prompt } from "effect/unstable/cli"
import { Errors } from "@projitect/core"
import type { ProjitectConfig } from "@projitect/core"
import { ensureGitRepo, gitStatus } from "../git.js"
import { remodel } from "./remodel.js"
import type { RemodelResult } from "./remodel.js"

export interface BuildResult {
  readonly wiped: readonly string[]
  readonly remodel: RemodelResult
}

/**
 * Paths that survive `pjt build --force`. Everything else under projectRoot is deleted before
 * the plan re-applies. This intentionally preserves the manifest (`package.json`), the blueprint
 * file, the lockfile, the dependency store, the git history, and PM lockfiles so the project is
 * recoverable.
 */
const PRESERVED = new Set<string>([
  ".git",
  "node_modules",
  ".pjt.ts",
  ".pjt.lock",
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
])

/**
 * `pjt build --force` — wipe the project tree (modulo preserved entries) and re-apply the plan
 * from scratch.
 *
 * Safety net:
 *   1. `--force` is required (the dispatcher's flag config enforces this at the CLI layer).
 *   2. The project must be a git repository (`pjt.git.not-a-repo` otherwise).
 *   3. The working tree must be clean (`pjt.apply.dirty-git`), unless `--force-dirty` is set.
 *   4. An interactive confirmation prompt fires unless `--yes` is passed.
 */
type BuildError = Errors.ProjitectError | Terminal.QuitError
type BuildRequirements = Prompt.Environment

export const build = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly force: boolean
  readonly forceDirty: boolean
  readonly yes: boolean
}): Effect.Effect<BuildResult, BuildError, BuildRequirements> =>
  Effect.gen(function* () {
    if (!params.force) {
      return yield* new Errors.ApplyDirtyGit({
        id: "pjt.apply.dirty-git",
        command: "build",
        message:
          "`pjt build` requires the `--force` flag. This command is destructive — it wipes the project tree before re-applying.",
      })
    }

    yield* ensureGitRepo({ projectRoot: params.config.projectRoot })

    if (!params.forceDirty) {
      const status = yield* gitStatus({ projectRoot: params.config.projectRoot })
      if (!status.clean) {
        return yield* new Errors.ApplyDirtyGit({
          id: "pjt.apply.dirty-git",
          command: "build",
          message:
            `Git working tree is dirty (${status.lines.length} uncommitted change${status.lines.length === 1 ? "" : "s"}). ` +
            "Commit your changes (`git add -A && git commit -m wip`) and re-run `pjt build --force`, or pass `--force-dirty` to wipe anyway.",
        })
      }
    }

    if (!params.yes) {
      const confirmed = yield* Prompt.confirm({
        message: `This will delete everything under ${params.config.projectRoot} except .git, node_modules, .pjt.ts, .pjt.lock, package.json, and the PM lockfile. Continue?`,
        initial: false,
      })
      if (!confirmed) {
        return {
          wiped: [],
          remodel: { written: [], removed: [] },
        }
      }
    }

    const wiped = yield* wipeTree(params.config.projectRoot)
    const remodelResult = yield* remodel({ config: params.config })
    return { wiped, remodel: remodelResult }
  })

const wipeTree = (projectRoot: string): Effect.Effect<readonly string[], Errors.FsWriteFailed> =>
  Effect.tryPromise({
    try: async () => {
      const entries = await fs.readdir(projectRoot)
      const toRemove = entries.filter((name) => !PRESERVED.has(name))
      await Promise.all(
        toRemove.map((name) =>
          fs.rm(path.join(projectRoot, name), { recursive: true, force: true }),
        ),
      )
      return toRemove
    },
    catch: (e) =>
      new Errors.FsWriteFailed({
        id: "pjt.fs.write-failed",
        path: projectRoot,
        cause: e instanceof Error ? e.message : String(e),
        message: `Failed to wipe project tree at ${projectRoot}`,
      }),
  })
