/**
 * @projitect/blueprint-next
 *
 * One composite blueprint that scaffolds a Next.js (App Router) + TypeScript app:
 *
 *  1. Composes the existing `tsconfig` (type-check only, DOM lib, `react-jsx`, the keys Next.js
 *     wants in `tsconfig.json`), `gitignore` (`node`, `next` and `tsbuildinfo` sections) and
 *     `vitest` (jsdom) blueprints, so each stays the single owner of its files.
 *  2. Owns `next.config.ts`. Owned mode — projitect rewrites it on every `remodel`.
 *  3. Merges the `dev` / `build` / `start` / `lint` scripts, the Next.js and React dependencies
 *     and the TypeScript / ESLint / testing devDependencies into `package.json`. Merge mode —
 *     user keys survive.
 *  4. Seeds the starter source (`src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`,
 *     `src/app/page.test.tsx`) and `eslint.config.mjs`, which extends `eslint-config-next`. Seed
 *     mode — written once, never enforced, so the app is yours to edit.
 */

import { Effect } from "effect"
import { jsonMerge, ownFile, seedFile } from "@projitect/blueprint"
import { gitignores } from "@projitect/blueprint-gitignore"
import { tsconfig } from "@projitect/blueprint-tsconfig"
import { vitest } from "@projitect/blueprint-vitest"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }
import * as templates from "./templates.js"

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` and `pjt inspect` can report a real upgrade.
const PACKAGE_VERSION = manifest.version

// The supported Next.js and React ranges. Keep `projitect.supports` in `package.json` in step.
const NEXT_DEP_RANGE = "^16.4.0"
const REACT_DEP_RANGE = "^19.2.0"
const ESLINT_DEP_RANGE = "^9.39.0"
const ESLINT_CONFIG_NEXT_DEP_RANGE = "^16.4.0"
const TYPESCRIPT_DEP_RANGE = "^5.9.0"
const TYPES_NODE_DEP_RANGE = "^22.19.0"
const TYPES_REACT_DEP_RANGE = "^19.2.0"
const JSDOM_DEP_RANGE = "^27.4.0"
const TESTING_LIBRARY_REACT_DEP_RANGE = "^16.3.0"
const TESTING_LIBRARY_DOM_DEP_RANGE = "^10.4.0"

/** Starter files, written once and never enforced. */
const STARTER_FILES = {
  "src/app/layout.tsx": templates.layoutTsx,
  "src/app/page.tsx": templates.pageTsx,
  "src/app/globals.css": templates.globalsCss,
  "src/app/page.test.tsx": templates.pageTestTsx,
  "eslint.config.mjs": templates.eslintConfig,
} as const

/**
 * Build the composite Next.js blueprint. Every operation is attributed to its own sub-blueprint
 * (`pjt:tsconfig`, `pjt:vitest`, `pjt:next`, …); removing `next()` from `.pjt.ts` removes the
 * maintained scaffolding and managed keys but leaves the seeded source and the user's own
 * `package.json` keys in place.
 */
export const next = (): Blueprint.Blueprint => {
  const id = "pjt:next"

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "Next.js scripts, dependencies and TypeScript / ESLint devDependencies",
    path: "package.json",
    ownedKeys: [
      "scripts.dev",
      "scripts.build",
      "scripts.start",
      "scripts.lint",
      "dependencies.next",
      "dependencies.react",
      "dependencies.react-dom",
      "devDependencies.@testing-library/dom",
      "devDependencies.@testing-library/react",
      "devDependencies.@types/node",
      "devDependencies.@types/react",
      "devDependencies.@types/react-dom",
      "devDependencies.eslint",
      "devDependencies.eslint-config-next",
      "devDependencies.jsdom",
      "devDependencies.typescript",
    ],
    value: {
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "eslint .",
      },
      dependencies: {
        next: NEXT_DEP_RANGE,
        react: REACT_DEP_RANGE,
        "react-dom": REACT_DEP_RANGE,
      },
      devDependencies: {
        "@testing-library/dom": TESTING_LIBRARY_DOM_DEP_RANGE,
        "@testing-library/react": TESTING_LIBRARY_REACT_DEP_RANGE,
        "@types/node": TYPES_NODE_DEP_RANGE,
        "@types/react": TYPES_REACT_DEP_RANGE,
        "@types/react-dom": TYPES_REACT_DEP_RANGE,
        eslint: ESLINT_DEP_RANGE,
        "eslint-config-next": ESLINT_CONFIG_NEXT_DEP_RANGE,
        jsdom: JSDOM_DEP_RANGE,
        typescript: TYPESCRIPT_DEP_RANGE,
      },
    },
  })

  const nextConfig = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "Next.js configuration",
    path: "next.config.ts",
    content: templates.nextConfig,
  })

  const starter = Object.entries(STARTER_FILES).map(([path, content]) =>
    seedFile({ id, version: PACKAGE_VERSION, description: `starter ${path}`, path, content }),
  )

  const parts = [
    // `next build` adds these keys to `tsconfig.json` when they are missing, and it requires the
    // automatic JSX runtime. Declaring them keeps the build from rewriting the owned file.
    tsconfig({
      module: "ESNext",
      dom: true,
      jsx: "react-jsx",
      noEmit: true,
      allowJs: true,
      incremental: true,
      plugins: ["next"],
      include: ["next-env.d.ts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
    }),
    gitignores.node(),
    gitignores.next(),
    gitignores.tsbuildinfo(),
    vitest({ environment: "jsdom" }),
    packageJsonMerge,
    nextConfig,
    ...starter,
  ]

  return {
    id,
    version: PACKAGE_VERSION,
    description:
      "Next.js App Router + TypeScript app (config, scripts, dependencies and starter source)",
    permissions: parts.flatMap((part) => part.permissions),
    plan: Effect.gen(function* () {
      const changeSets = yield* Effect.forEach(parts, (part) => part.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}
