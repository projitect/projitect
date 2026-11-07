/**
 * @projitect/blueprint-react
 *
 * One composite blueprint that scaffolds a React + Vite + TypeScript app:
 *
 *  1. Composes the existing `tsconfig` (DOM lib, `react-jsx`, bundler resolution), `gitignore`
 *     (`node` section) and `vitest` (jsdom) blueprints, so each stays the single owner of its
 *     files.
 *  2. Owns `vite.config.ts`. Owned mode — projitect rewrites it on every `remodel`. It holds no
 *     `test` block; `vitest.config.ts` (owned by the vitest blueprint) takes precedence for tests.
 *  3. Merges the `dev` / `build` / `preview` scripts, the React dependencies and the Vite /
 *     TypeScript / testing devDependencies into `package.json`. Merge mode — user keys survive.
 *  4. Adds `dist/` to `.gitignore`. Region mode.
 *  5. Seeds the starter source (`index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`,
 *     `src/index.css`). Seed mode — written once, never enforced, so the app is yours to edit.
 */

import { Effect } from "effect"
import { ignoreSection, jsonMerge, ownFile, seedFile } from "@projitect/blueprint"
import { gitignores } from "@projitect/blueprint-gitignore"
import { tsconfig } from "@projitect/blueprint-tsconfig"
import { vitest } from "@projitect/blueprint-vitest"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS } from "@projitect/core"
import * as templates from "./templates.js"

const PACKAGE_VERSION = "0.0.0"

const REACT_DEP_RANGE = "^19.2.0"
const VITE_DEP_RANGE = "^7.3.0"
const PLUGIN_REACT_DEP_RANGE = "^5.2.0"
const TYPESCRIPT_DEP_RANGE = "^5.9.0"
const TYPES_REACT_DEP_RANGE = "^19.2.0"
const JSDOM_DEP_RANGE = "^27.4.0"
const TESTING_LIBRARY_REACT_DEP_RANGE = "^16.3.0"
const TESTING_LIBRARY_DOM_DEP_RANGE = "^10.4.0"

/** Starter files, written once and never enforced. */
const STARTER_FILES = {
  "index.html": templates.indexHtml,
  "src/main.tsx": templates.mainTsx,
  "src/App.tsx": templates.appTsx,
  "src/App.test.tsx": templates.appTestTsx,
  "src/index.css": templates.indexCss,
} as const

/**
 * Build the composite React blueprint. Every operation is attributed to its own sub-blueprint
 * (`pjt:tsconfig`, `pjt:vitest`, `pjt:react`, …); removing `react()` from `.pjt.ts` removes the
 * maintained scaffolding and managed keys but leaves the seeded source and the user's own
 * `package.json` keys in place.
 */
export const react = (): Blueprint.Blueprint => {
  const id = "pjt:react"

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "React scripts, dependencies and Vite / TypeScript devDependencies",
    path: "package.json",
    ownedKeys: [
      "scripts.dev",
      "scripts.build",
      "scripts.preview",
      "dependencies.react",
      "dependencies.react-dom",
      "devDependencies.@testing-library/dom",
      "devDependencies.@testing-library/react",
      "devDependencies.@types/react",
      "devDependencies.@types/react-dom",
      "devDependencies.@vitejs/plugin-react",
      "devDependencies.jsdom",
      "devDependencies.typescript",
      "devDependencies.vite",
    ],
    value: {
      scripts: {
        dev: "vite",
        build: "tsc --noEmit && vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: REACT_DEP_RANGE,
        "react-dom": REACT_DEP_RANGE,
      },
      devDependencies: {
        "@testing-library/dom": TESTING_LIBRARY_DOM_DEP_RANGE,
        "@testing-library/react": TESTING_LIBRARY_REACT_DEP_RANGE,
        "@types/react": TYPES_REACT_DEP_RANGE,
        "@types/react-dom": TYPES_REACT_DEP_RANGE,
        "@vitejs/plugin-react": PLUGIN_REACT_DEP_RANGE,
        jsdom: JSDOM_DEP_RANGE,
        typescript: TYPESCRIPT_DEP_RANGE,
        vite: VITE_DEP_RANGE,
      },
    },
  })

  const viteConfig = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "Vite configuration",
    path: "vite.config.ts",
    content: templates.viteConfig,
  })

  const gitignoreDist = ignoreSection({
    id,
    version: PACKAGE_VERSION,
    description: "ignore Vite build output",
    path: ".gitignore",
    content: "dist/\n",
  })

  const starter = Object.entries(STARTER_FILES).map(([path, content]) =>
    seedFile({ id, version: PACKAGE_VERSION, description: `starter ${path}`, path, content }),
  )

  const parts = [
    tsconfig({ module: "ESNext", dom: true, jsx: "react-jsx" }),
    gitignores.node(),
    vitest({ environment: "jsdom" }),
    packageJsonMerge,
    viteConfig,
    gitignoreDist,
    ...starter,
  ]

  return {
    id,
    version: PACKAGE_VERSION,
    description: "React + Vite + TypeScript app (config, scripts, dependencies and starter source)",
    permissions: parts.flatMap((part) => part.permissions),
    plan: Effect.gen(function* () {
      const changeSets = yield* Effect.forEach(parts, (part) => part.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}
