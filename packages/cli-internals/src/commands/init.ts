import { promises as fs } from "node:fs"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { Array, Effect, Option, Schema } from "effect"
import { Errors } from "@projitect/core"
import type { ProjitectConfig } from "@projitect/core"
import { detect, installDev as installDevelopment, installProject } from "../pm.js"
import { remodel } from "./remodel.js"
import type { RemodelResult } from "./remodel.js"

const manifest = Schema.decodeUnknownSync(
  Schema.Struct({
    version: Schema.String,
    peerDependencies: Schema.Struct({ effect: Schema.String }),
  }),
)(createRequire(import.meta.url)("../../package.json"))

export interface InitResult {
  readonly seededBlueprintFile: boolean
  readonly bootstrappedGit: boolean
  readonly bootstrappedPackageJson: boolean
  readonly remodel: RemodelResult
}

/**
 * `pjt init` — bootstrap projitect in the current project.
 *
 * Verifies the prerequisites (`.git/` and `package.json` both present), seeds an empty
 * `.pjt.ts` with the marker structure if absent, then delegates to `remodel` which runs the
 * standard plan/apply/lockfile-write pipeline. The projitect blueprint (prepended automatically
 * by `@projitect/cli`'s `pjt()`) writes the package.json entries and the `.pjt.ts` import region
 * on its first apply. Before seeding or loading the config, missing local CLI and Effect
 * dependencies are installed so an ephemeral dlx invocation can resolve those imports.
 *
 * With `yes: true`, both prerequisites are auto-bootstrapped instead of erroring:
 *   - Missing `.git/` → `git init -q` shell-out.
 *   - Missing `package.json` → a minimal stub is written (`{ "name": "<dirname>", ... }`).
 * This is what CI / scripted setups use (`pjt init --yes`); the interactive flow keeps the
 * stricter prerequisite checks so a typo doesn't accidentally create a git repo in `$HOME`.
 *
 * No special-case code for "the projitect bootstrap" lives here — the projitect blueprint owns
 * those concerns and runs through the same pipeline as every other blueprint.
 */
export const init = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly yes?: boolean
}): Effect.Effect<InitResult, Errors.ProjitectError> =>
  Effect.gen(function* () {
    const bootstrappedGit = yield* ensureGit(params.config.projectRoot, params.yes ?? false)
    const bootstrappedPackageJson = yield* ensurePackageJson(
      params.config.projectRoot,
      params.yes ?? false,
    )

    const bootstrapPm = yield* ensureBootstrapDependencies(params.config.projectRoot)

    const seededBlueprintFile = yield* seedBlueprintFileIfAbsent(
      params.config.projectRoot,
      params.config.blueprintFile,
    )

    const remodelResult = yield* remodel({ config: params.config })
    yield* Option.match(bootstrapPm, {
      onNone: () => Effect.void,
      onSome: (pm) => installProject({ projectRoot: params.config.projectRoot, pm }),
    })

    return {
      seededBlueprintFile,
      bootstrappedGit,
      bootstrappedPackageJson,
      remodel: remodelResult,
    }
  })

/** A dlx runner lives outside the project; generated imports must resolve locally first. */
const ensureBootstrapDependencies = (projectRoot: string) =>
  Effect.forEach(
    [
      { name: "@projitect/cli", spec: `@projitect/cli@${manifest.version}` },
      { name: "effect", spec: `effect@${manifest.peerDependencies.effect}` },
    ],
    ({ name, spec }) =>
      Effect.gen(function* () {
        const installed = yield* Effect.promise(() =>
          fs.access(path.join(projectRoot, "node_modules", name, "package.json")).then(
            () => true,
            () => false,
          ),
        )
        if (installed) {
          return Option.none()
        }
        const pm = yield* detect({ projectRoot })
        yield* installDevelopment({ projectRoot, pm, pkg: spec })
        return Option.some(pm)
      }),
  ).pipe(Effect.map((results) => Array.head(Array.getSomes(results))))

const ensureGit = (
  projectRoot: string,
  yes: boolean,
): Effect.Effect<boolean, Errors.InitGitMissing> =>
  Effect.gen(function* () {
    const ok = yield* Effect.promise(() =>
      fs.access(path.join(projectRoot, ".git")).then(
        () => true,
        () => false,
      ),
    )
    if (ok) {
      return false
    }
    if (!yes) {
      return yield* new Errors.InitGitMissing({
        id: "pjt.init.git-missing",
        message:
          "No `.git` directory found. Run `git init` and then `pjt init` again, or run `pjt init --yes` to create the repository for you.",
      })
    }
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          const child = spawn("git", ["init", "-q"], { cwd: projectRoot, stdio: "ignore" })
          child.on("error", reject)
          child.on("close", (code) => {
            if (code === 0) {
              resolve()
            } else {
              reject(new Error(`git init exited with ${String(code)}`))
            }
          })
        }),
    )
    return true
  })

const ensurePackageJson = (
  projectRoot: string,
  yes: boolean,
): Effect.Effect<boolean, Errors.InitPackageJsonMissing | Errors.FsWriteFailed> =>
  Effect.gen(function* () {
    const ok = yield* Effect.promise(() =>
      fs.access(path.join(projectRoot, "package.json")).then(
        () => true,
        () => false,
      ),
    )
    if (ok) {
      return false
    }
    if (!yes) {
      return yield* new Errors.InitPackageJsonMissing({
        id: "pjt.init.package-json-missing",
        message:
          "No `package.json` found. Run `npm init -y` (or your PM equivalent) first, then re-run `pjt init` — or pass `--yes` to auto-bootstrap.",
      })
    }
    const name = path.basename(projectRoot) || "project"
    const stub = {
      name,
      version: "0.0.0",
      private: true,
      type: "module" as const,
    }
    yield* Effect.tryPromise({
      try: () =>
        fs.writeFile(
          path.join(projectRoot, "package.json"),
          `${JSON.stringify(stub, null, 2)}\n`,
          "utf8",
        ),
      catch: (e) =>
        new Errors.FsWriteFailed({
          id: "pjt.fs.write-failed",
          path: "package.json",
          cause: e instanceof Error ? e.message : String(e),
          message: "Failed to seed package.json during `pjt init --yes`",
        }),
    })
    return true
  })

const seedBlueprintFileIfAbsent = (
  projectRoot: string,
  blueprintFile: string,
): Effect.Effect<boolean, Errors.FsWriteFailed> =>
  Effect.gen(function* () {
    const full = path.join(projectRoot, blueprintFile)
    const exists = yield* Effect.promise(() =>
      fs.access(full).then(
        () => true,
        () => false,
      ),
    )
    if (exists) {
      return false
    }

    yield* Effect.tryPromise({
      try: () => fs.writeFile(full, STARTER_PJT_TS, "utf8"),
      catch: (e) =>
        new Errors.FsWriteFailed({
          id: "pjt.fs.write-failed",
          path: blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Failed to seed ${blueprintFile}`,
        }),
    })
    return true
  })

/**
 * Starter `.pjt.ts` template. Three marker regions: the projitect blueprint owns
 * `pjt:projitect:imports` (it writes the `import { pjt } from "@projitect/cli"` line on first
 * remodel). The other two — `pjt:imports` and `pjt:blueprints` — are **convention anchors**
 * that `pjt add` splices into; they are not managed regions and don't appear in `.pjt.lock`.
 */
const STARTER_PJT_TS = `// pjt:projitect:imports start
import { pjt } from "@projitect/cli"
// pjt:projitect:imports end

// pjt:imports start
// pjt:imports end

export default pjt({
  blueprints: [
    // pjt:blueprints start
    // pjt:blueprints end
  ],
})
`
