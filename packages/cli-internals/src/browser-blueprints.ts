import * as Effect from "effect"
import * as Blueprint from "@projitect/blueprint"
import * as Changesets from "@projitect/blueprint-changesets"
import * as Gitignore from "@projitect/blueprint-gitignore"
import * as HuskyLintStaged from "@projitect/blueprint-husky-lint-staged"
import * as Markdown from "@projitect/blueprint-markdown"
import * as Next from "@projitect/blueprint-next"
import * as React from "@projitect/blueprint-react"
import * as Skills from "@projitect/blueprint-skills"
import * as Tsconfig from "@projitect/blueprint-tsconfig"
import * as Vitest from "@projitect/blueprint-vitest"
import { pjt } from "./config-file.js"
import type { ModuleRegistry } from "./evaluate-pjt.js"

/**
 * The module registry a browser `.pjt.ts` evaluates against — `@projitect/cli-internals/browser-blueprints`.
 * The first-party blueprint packages are imported directly (so a bundler includes exactly what a
 * demo ships), keyed by the specifier a real `.pjt.ts` writes. `projitect/cli` maps to the raw
 * `pjt` and `directory`: the CLI's version also prepends a blueprint that reads `package.json`
 * through Node, which has no browser equivalent.
 *
 * The blueprint packages are optional peers: import this entry only where they are installed.
 */
export const firstPartyRegistry: ModuleRegistry = {
  effect: Effect,
  "projitect/cli": { pjt, directory: Blueprint.directory },
  "@projitect/blueprint": Blueprint,
  "@projitect/blueprint-changesets": Changesets,
  "@projitect/blueprint-gitignore": Gitignore,
  "@projitect/blueprint-husky-lint-staged": HuskyLintStaged,
  "@projitect/blueprint-markdown": Markdown,
  "@projitect/blueprint-next": Next,
  "@projitect/blueprint-react": React,
  "@projitect/blueprint-skills": Skills,
  "@projitect/blueprint-tsconfig": Tsconfig,
  "@projitect/blueprint-vitest": Vitest,
}
