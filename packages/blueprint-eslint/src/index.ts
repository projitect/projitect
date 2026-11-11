/**
 * @projitect/blueprint-eslint
 *
 * Two blueprints, exported on the `eslint` namespace:
 *
 *  - `eslint.config()` — a composite blueprint. Owns a flat `eslint.config.js` (including its
 *    `ignores` list) and merges the `lint` / `lint:fix` scripts plus the eslint and
 *    typescript-eslint devDependencies into `package.json`.
 *  - `eslint.fix()` — a post-apply command. `pjt build` / `pjt remodel` run `eslint --fix .`
 *    after every file operation succeeded; `pjt inspect` runs only `eslint .` and reports a
 *    failing check as drift without touching files. It declares the `exec` permission for both
 *    command lines.
 *
 * Composing `config()` alone is valid and yields no exec operation. Exec operations run last and
 * in array order, so place `eslint.fix()` before or after a formatter's fix to pick the sequence.
 */

import { Effect } from "effect"
import { exec, jsonMerge, ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` without a hand-edited constant. JSON import keeps this runtime-pure.
const PACKAGE_VERSION = manifest.version

const ESLINT_DEP_RANGE = "^10.0.0"
const ESLINT_JS_DEP_RANGE = "^10.0.0"
const TYPESCRIPT_ESLINT_DEP_RANGE = "^8.0.0"
const ESLINT_CONFIG_PRETTIER_DEP_RANGE = "^10.0.0"

const DEFAULT_IGNORES = ["dist", "coverage", "node_modules"] as const

const CHECK_COMMAND = "eslint ."
const FIX_COMMAND = "eslint --fix ."

/**
 * Options for `eslint.config()`. All optional; defaults give a working setup.
 */
export interface EslintConfigOptions {
  /**
   * Extra glob patterns appended to the default `ignores` (`dist`, `coverage`, `node_modules`).
   */
  readonly ignores?: readonly string[]
  /**
   * Include the typescript-eslint recommended rules. Defaults to `true`.
   */
  readonly typescript?: boolean
  /**
   * Set to `"config"` to add `eslint-config-prettier` (turns off rules that conflict with
   * Prettier). Defaults to `null`: no Prettier integration.
   */
  readonly prettier?: "config" | null
}

/**
 * Options for `eslint.fix()`. None yet; the object is accepted so call sites stay stable.
 */
export type EslintFixOptions = Record<string, never>

/**
 * Build the composite config blueprint: an owned `eslint.config.js` plus a `package.json` merge.
 */
const config = (options: EslintConfigOptions = {}): Blueprint.Blueprint => {
  const typescript = options.typescript ?? true
  const prettier = options.prettier ?? null
  const ignores = [...new Set([...DEFAULT_IGNORES, ...(options.ignores ?? [])])]

  const id = "pjt:eslint"

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "eslint devDependencies and lint scripts",
    path: "package.json",
    ownedKeys: [
      "scripts.lint",
      "scripts.lint:fix",
      "devDependencies.eslint",
      "devDependencies.@eslint/js",
      ...(typescript ? ["devDependencies.typescript-eslint" as const] : []),
      ...(prettier === "config" ? ["devDependencies.eslint-config-prettier" as const] : []),
    ],
    value: {
      scripts: {
        lint: CHECK_COMMAND,
        "lint:fix": FIX_COMMAND,
      },
      devDependencies: {
        eslint: ESLINT_DEP_RANGE,
        "@eslint/js": ESLINT_JS_DEP_RANGE,
        ...(typescript && { "typescript-eslint": TYPESCRIPT_ESLINT_DEP_RANGE }),
        ...(prettier === "config" && {
          "eslint-config-prettier": ESLINT_CONFIG_PRETTIER_DEP_RANGE,
        }),
      },
    },
  })

  const eslintConfig = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "eslint flat configuration",
    path: "eslint.config.js",
    content: renderEslintConfig({ ignores, typescript, prettier }),
  })

  return {
    id,
    version: PACKAGE_VERSION,
    description: "eslint scaffolding (flat config + lint scripts + devDeps)",
    permissions: [
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: "eslint.config.js" },
    ],
    plan: Effect.gen(function* () {
      const changeSets = yield* Effect.forEach([packageJsonMerge, eslintConfig], (b) => b.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}

/**
 * Build the post-apply fix blueprint. Its only operation is the exec: `eslint --fix .` on
 * build/remodel, `eslint .` on inspect.
 */
const fix = (_options: EslintFixOptions = {}): Blueprint.Blueprint =>
  exec({
    id: "pjt:eslint-fix",
    version: PACKAGE_VERSION,
    description: "run eslint --fix after every file is written",
    check: CHECK_COMMAND,
    fix: FIX_COMMAND,
  })

export const eslint = { config, fix }

const renderEslintConfig = (params: {
  readonly ignores: readonly string[]
  readonly typescript: boolean
  readonly prettier: "config" | null
}): string => {
  const imports = [
    'import js from "@eslint/js"',
    ...(params.typescript ? ['import tseslint from "typescript-eslint"'] : []),
    ...(params.prettier === "config" ? ['import prettier from "eslint-config-prettier"'] : []),
  ]
  const entries = [
    `  { ignores: [${params.ignores.map((i) => JSON.stringify(i)).join(", ")}] },`,
    "  js.configs.recommended,",
    ...(params.typescript ? ["  ...tseslint.configs.recommended,"] : []),
    ...(params.prettier === "config" ? ["  prettier,"] : []),
  ]
  return [
    ...imports,
    "",
    "// Scaffolded by `@projitect/blueprint-eslint`. Owned mode — projitect rewrites this file on",
    "// every `pjt remodel`. Put extra rules in a separate config file.",
    "export default [",
    ...entries,
    "]",
    "",
  ].join("\n")
}
