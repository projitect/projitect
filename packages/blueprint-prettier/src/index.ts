/**
 * @projitect/blueprint-prettier
 *
 * The `prettier` namespace holds two blueprints that keep a project formatted:
 *
 *  - `prettier.config(options?)` owns `.prettierrc.json` (owned mode — projitect rewrites it on
 *    every `remodel`, so teams adjust it through options rather than by hand) and merges the
 *    `format` script and `prettier` devDependency into `package.json` (merge mode).
 *  - `prettier.fix(options?)` contributes a post-apply exec operation: `pjt build` and
 *    `pjt remodel` run `prettier --write` after every file is written, and `pjt inspect` runs
 *    `prettier --check` and reports a failure as drift.
 *
 * Ignore files are not managed here; leave `.prettierignore` to the project.
 */

import { Effect, Match } from "effect"
import { exec, jsonMerge, ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` without a hand-edited constant. JSON import keeps this runtime-pure.
const PACKAGE_VERSION = manifest.version

const PRETTIER_DEP_RANGE = "^3.0.0"
const CONFIG_PATH = ".prettierrc.json"

/** Options for `prettier.config()`. All optional; only the ones given are written. */
export interface PrettierConfigOptions {
  /** Print semicolons. */
  readonly semi?: boolean
  /** Use single quotes instead of double quotes. */
  readonly singleQuote?: boolean
  /** Line length the printer wraps at. */
  readonly printWidth?: number
  /** Spaces per indentation level. */
  readonly tabWidth?: number
  /** Where to print trailing commas. */
  readonly trailingComma?: "all" | "es5" | "none"
  /** How to wrap prose in Markdown files. */
  readonly proseWrap?: "always" | "never" | "preserve"
}

/** The package manager whose runner resolves the project-local `prettier` binary. */
export type PrettierPackageManager = "pnpm" | "npm" | "yarn" | "bun"

/** Options for `prettier.fix()`. */
export interface PrettierFixOptions {
  /**
   * Package manager that runs the project-local `prettier`. The commands are spawned without a
   * shell, so a bare `prettier` is not on the path. Defaults to `"npm"` (`npx --no-install`),
   * which resolves `node_modules/.bin` in any Node project.
   */
  readonly packageManager?: PrettierPackageManager
}

const config = (options: PrettierConfigOptions = {}): Blueprint.Blueprint => {
  const id = "pjt:prettier"

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "prettier format script and devDependency",
    path: "package.json",
    ownedKeys: ["scripts.format", "devDependencies.prettier"],
    value: {
      scripts: { format: "prettier --write ." },
      devDependencies: { prettier: PRETTIER_DEP_RANGE },
    },
  })

  const configFile = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "prettier configuration",
    path: CONFIG_PATH,
    content: renderConfig(options),
  })

  return {
    id,
    version: PACKAGE_VERSION,
    description: "prettier configuration (config + format script + devDep)",
    permissions: [
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: CONFIG_PATH },
    ],
    plan: Effect.gen(function* () {
      const changeSets = yield* Effect.forEach([packageJsonMerge, configFile], (b) => b.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}

// The runner prefix per package manager; `prettier` and its arguments follow it.
const runnerPrefix = Match.type<PrettierPackageManager>().pipe(
  Match.when("pnpm", () => "pnpm exec"),
  Match.when("npm", () => "npx --no-install"),
  Match.when("yarn", () => "yarn"),
  Match.when("bun", () => "bunx --no-install"),
  Match.exhaustive,
)

const fix = (options: PrettierFixOptions = {}): Blueprint.Blueprint => {
  const prefix = runnerPrefix(options.packageManager ?? "npm")
  return exec({
    id: "pjt:prettier:fix",
    version: PACKAGE_VERSION,
    description: "format the project with prettier after build and remodel",
    fix: `${prefix} prettier --write .`,
    check: `${prefix} prettier --check .`,
  })
}

// Only the options given are emitted, in a fixed key order, so the output is deterministic.
const renderConfig = (options: PrettierConfigOptions): string =>
  `${JSON.stringify(
    {
      ...(options.semi === undefined ? {} : { semi: options.semi }),
      ...(options.singleQuote === undefined ? {} : { singleQuote: options.singleQuote }),
      ...(options.printWidth === undefined ? {} : { printWidth: options.printWidth }),
      ...(options.tabWidth === undefined ? {} : { tabWidth: options.tabWidth }),
      ...(options.trailingComma === undefined ? {} : { trailingComma: options.trailingComma }),
      ...(options.proseWrap === undefined ? {} : { proseWrap: options.proseWrap }),
    },
    null,
    2,
  )}\n`

export const prettier = { config, fix }
