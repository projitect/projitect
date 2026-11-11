/**
 * @projitect/blueprint-prettier
 *
 * The `prettier` namespace holds two blueprints that keep a project formatted:
 *
 *  - `prettier.config(options?)` owns `.prettierrc.json` (owned mode — projitect rewrites it on
 *    every `remodel`, so teams adjust it through options rather than by hand) and merges the
 *    `format` script and `prettier` devDependency into `package.json` (merge mode).
 *  - `prettier.fix()` contributes a post-apply exec operation: `pjt build` and
 *    `pjt remodel` run `prettier --write` after every file is written, and `pjt inspect` runs
 *    `prettier --check` and reports a failure as drift.
 *
 * Ignore files are not managed here; leave `.prettierignore` to the project.
 */

import { Effect, Struct } from "effect"
import * as babelPlugin from "prettier/plugins/babel"
import * as estreePlugin from "prettier/plugins/estree"
import { format } from "prettier/standalone"
import { exec, jsonMerge, ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS, Errors } from "@projitect/core"
import prettierManifest from "prettier/package.json" with { type: "json" }
import manifest from "../package.json" with { type: "json" }

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` without a hand-edited constant. JSON import keeps this runtime-pure.
const PACKAGE_VERSION = manifest.version

// Pin the consumer's formatter to the same version that renders the managed configuration.
const PRETTIER_VERSION = prettierManifest.version
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

const config = (options: PrettierConfigOptions = {}): Blueprint.Blueprint => {
  const id = "pjt:prettier"
  const content = renderConfig(options)

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "prettier format script and devDependency",
    path: "package.json",
    ownedKeys: ["scripts.format", "devDependencies.prettier"],
    value: {
      scripts: { format: "prettier --write ." },
      devDependencies: { prettier: PRETTIER_VERSION },
    },
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
      const configFile = ownFile({
        id,
        version: PACKAGE_VERSION,
        description: "prettier configuration",
        path: CONFIG_PATH,
        content: yield* content,
      })
      const changeSets = yield* Effect.forEach([packageJsonMerge, configFile], (b) => b.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}

/** Run the project-local formatter through the shared CLI runner. */
const fix = (): Blueprint.Blueprint =>
  exec({
    id: "pjt:prettier:fix",
    version: PACKAGE_VERSION,
    description: "format the project with prettier after build and remodel",
    fix: "prettier --write .",
    check: "prettier --check .",
  })

// Snapshot supported options in a fixed order; never pass arbitrary caller fields to Prettier.
const renderConfig = (options: PrettierConfigOptions) => {
  const settings = Struct.pick(options, [
    "semi",
    "singleQuote",
    "printWidth",
    "tabWidth",
    "trailingComma",
    "proseWrap",
  ])
  return Effect.tryPromise({
    try: () =>
      format(JSON.stringify(settings), {
        ...settings,
        parser: "json",
        plugins: [babelPlugin, estreePlugin],
      }),
    catch: (cause) =>
      new Errors.PrettierInvalidOptions({
        id: "pjt.prettier.invalid-options",
        message: `Cannot format the managed Prettier configuration: ${globalThis.String(cause)}`,
      }),
  })
}

export const prettier = { config, fix }
