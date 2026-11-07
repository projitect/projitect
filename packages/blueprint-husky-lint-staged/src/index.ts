/**
 * @projitect/blueprint-husky-lint-staged
 *
 * One composite blueprint that wires commit-time linting and formatting into a project:
 *
 *  1. Owns `.husky/pre-commit` with a single `lint-staged` line. Owned mode — projitect rewrites
 *     this file on every `remodel`. Husky 9 runs hooks through `sh`, so the file needs no
 *     executable bit (the SDK cannot set one) and no `husky.sh` bootstrap.
 *  2. Merges the `lint-staged` field, `scripts.prepare` (`husky`) and the `husky` / `lint-staged`
 *     devDependencies into `package.json`. Merge mode — non-conflicting with whatever else lives
 *     in the file.
 */

import { Effect } from "effect"
import { jsonMerge, ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS } from "@projitect/core"

const PACKAGE_VERSION = "0.0.0"

const HUSKY_DEP_RANGE = "^9.0.0"
const LINT_STAGED_DEP_RANGE = "^16.0.0"

/** A lint-staged config: globs mapped to the command (or commands) run on matching staged files. */
export type LintStagedConfig = Readonly<Record<string, string | readonly string[]>>

const DEFAULT_CONFIG: LintStagedConfig = {
  "*.{js,jsx,ts,tsx,mjs,cjs}": "eslint --fix",
  "*.{json,md,mdx,yml,yaml,css}": "prettier --write",
}

/**
 * Options for the husky + lint-staged blueprint. All optional.
 */
export interface HuskyLintStagedOptions {
  /**
   * The `lint-staged` config. When given it replaces the default entirely (no merge): globs mapped
   * to the command or commands run on matching staged files. Defaults to `eslint --fix` for
   * JS/TS files and `prettier --write` for JSON, Markdown, YAML and CSS.
   */
  readonly config?: LintStagedConfig
}

/**
 * Build the composite husky + lint-staged blueprint. The returned `Blueprint` emits two operations
 * (merge `package.json`, own `.husky/pre-commit`), both attributed to `pjt:husky-lint-staged`.
 */
export const huskyLintStaged = (options: HuskyLintStagedOptions = {}): Blueprint.Blueprint => {
  const id = "pjt:husky-lint-staged"

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "lint-staged config, prepare script and husky / lint-staged devDependencies",
    path: "package.json",
    ownedKeys: [
      "lint-staged",
      "scripts.prepare",
      "devDependencies.husky",
      "devDependencies.lint-staged",
    ],
    value: {
      "lint-staged": options.config ?? DEFAULT_CONFIG,
      scripts: { prepare: "husky" },
      devDependencies: {
        husky: HUSKY_DEP_RANGE,
        "lint-staged": LINT_STAGED_DEP_RANGE,
      },
    },
  })

  const hook = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "husky pre-commit hook",
    path: ".husky/pre-commit",
    content: "lint-staged\n",
  })

  return {
    id,
    version: PACKAGE_VERSION,
    description: "husky + lint-staged commit-time checks (hook + config + scripts + devDeps)",
    permissions: [
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: ".husky/pre-commit" },
    ],
    plan: Effect.gen(function* () {
      const changeSets = yield* Effect.forEach([packageJsonMerge, hook], (b) => b.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}
