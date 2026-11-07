/**
 * @projitect/blueprint-vitest
 *
 * One composite blueprint that wires vitest into a project:
 *
 *  1. Adds `vitest` and (optionally) `@vitest/coverage-v8` to `package.json`'s `devDependencies`,
 *     plus `test` / `test:watch` scripts. Merge mode — non-conflicting with whatever else lives
 *     in `package.json`.
 *  2. Owns `vitest.config.ts` with sensible defaults (NodeNext-friendly, v8 coverage). Owned
 *     mode — projitect rewrites this file from scratch on every `remodel` so the user can't
 *     accidentally drift it. If the user wants project-specific overrides, they should compose
 *     this blueprint with their own `ownFile` blueprint at a different path.
 *  3. Adds `coverage/` to `.gitignore`. Region mode — coexists with whatever else is in the file
 *     (including other projitect blueprints like `@projitect/blueprint-gitignore`).
 *
 * This is the smallest framework blueprint we ship after gitignore. It validates merge mode +
 * owned mode + region mode in one move, and it's the first time the projitect blueprint won't
 * be the *only* merge-mode consumer in a real project.
 */

import { Effect } from "effect"
import { regionFile, jsonMerge, ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` without a hand-edited constant. JSON import keeps this runtime-pure.
const PACKAGE_VERSION = manifest.version

const VITEST_DEP_RANGE = "^4.0.0"
const COVERAGE_V8_DEP_RANGE = "^4.0.0"

/**
 * Options for the vitest blueprint. All optional; defaults give a working setup.
 */
export interface VitestOptions {
  /**
   * Coverage provider. Defaults to `"v8"`. Set to `null` to skip the coverage devDep and the
   * `.gitignore` coverage entry (you'll get vitest without coverage configured).
   */
  readonly coverage?: "v8" | null
  /**
   * Override the script name for the one-shot test runner. Defaults to `"test"`.
   * The watch variant is always `<scriptName>:watch`.
   */
  readonly scriptName?: string
  /**
   * Test environment. Defaults to `"node"` (matches vitest's default). Set to `"jsdom"` if you
   * want DOM globals — you'll also need to install `jsdom` separately; this blueprint does not
   * add it because not every consumer needs it.
   */
  readonly environment?: "node" | "jsdom"
}

/**
 * Build the composite vitest blueprint. The returned `Blueprint` emits three to four operations
 * depending on options; the planner / lockfile track each separately so the user gets fine-
 * grained drift reporting (e.g. "package.json merge drift on devDependencies.vitest" rather than
 * a vague "blueprint drift").
 */
export const vitest = (options: VitestOptions = {}): Blueprint.Blueprint => {
  const coverage = options.coverage === undefined ? "v8" : options.coverage
  const scriptName = options.scriptName ?? "test"
  const watchScript = `${scriptName}:watch`
  const environment = options.environment ?? "node"

  const id = "pjt:vitest"

  // We compose four constructor blueprints inline rather than handing four separate Blueprint
  // entries to the user — that way `pjt add @projitect/blueprint-vitest` adds one call line, and
  // every drift / removal is attributed to `pjt:vitest`. The composite plan just `Effect.all`s
  // their `plan` Effects and concatenates the resulting ChangeSets.

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "vitest devDependencies and test scripts",
    path: "package.json",
    ownedKeys: [
      `scripts.${scriptName}`,
      `scripts.${watchScript}`,
      "devDependencies.vitest",
      ...(coverage === "v8" ? ["devDependencies.@vitest/coverage-v8" as const] : []),
    ],
    value: {
      scripts: {
        [scriptName]: "vitest run",
        [watchScript]: "vitest",
      },
      devDependencies: {
        vitest: VITEST_DEP_RANGE,
        ...(coverage === "v8" && { "@vitest/coverage-v8": COVERAGE_V8_DEP_RANGE }),
      },
    },
  })

  const vitestConfig = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "vitest configuration",
    path: "vitest.config.ts",
    content: renderVitestConfig({ coverage, environment }),
  })

  const gitignoreCoverage =
    coverage === "v8"
      ? regionFile({
          id,
          version: PACKAGE_VERSION,
          description: "ignore vitest coverage output",
          path: ".gitignore",
          commentPrefix: "#",
          content: "coverage/\n",
        })
      : null

  const composite: Blueprint.Blueprint = {
    id,
    version: PACKAGE_VERSION,
    description: "vitest scaffolding (config + scripts + devDeps + coverage gitignore)",
    permissions: [
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: "vitest.config.ts" },
      { kind: "read", glob: ".gitignore" },
      { kind: "write", glob: ".gitignore" },
    ],
    plan: Effect.gen(function* () {
      const parts = [
        packageJsonMerge,
        vitestConfig,
        ...(gitignoreCoverage === null ? [] : [gitignoreCoverage]),
      ]
      const changeSets = yield* Effect.forEach(parts, (b) => b.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }

  return composite
}

const renderVitestConfig = (params: {
  readonly coverage: "v8" | null
  readonly environment: "node" | "jsdom"
}): string => {
  const lines: string[] = [
    'import { defineConfig } from "vitest/config"',
    "",
    "/**",
    " * vitest configuration scaffolded by `@projitect/blueprint-vitest`.",
    " *",
    " * Owned mode — projitect rewrites this file on every `pjt remodel`. If you need overrides,",
    " * compose another `ownFile` blueprint at a different path (e.g. `vitest.config.local.ts`)",
    " * and merge it into this config via vitest's own `mergeConfig` helper at runtime.",
    " */",
    "export default defineConfig({",
    "  test: {",
    `    environment: "${params.environment}",`,
    "    passWithNoTests: true,",
  ]

  if (params.coverage === "v8") {
    lines.push(
      "    coverage: {",
      '      provider: "v8",',
      '      reporter: ["text", "html"],',
      "    },",
    )
  }

  lines.push("  },", "})", "")
  return lines.join("\n")
}
