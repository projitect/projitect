/**
 * @projitect/blueprint-react
 *
 * One composite blueprint that scaffolds a React + Vite + TypeScript app:
 *
 *  1. Composes the existing `tsconfig` (DOM lib, `react-jsx`, bundler resolution), `gitignore`
 *     (`node` section) and `vitest` (jsdom) blueprints, so each stays the single owner of its
 *     files. The JavaScript template (`template: "react"`) skips `tsconfig`.
 *  2. Owns `vite.config.ts` (`vite.config.js` for the JavaScript template). Owned mode — projitect rewrites it on every `remodel`. It holds no
 *     `test` block; `vitest.config.ts` (owned by the vitest blueprint) takes precedence for tests.
 *  3. Merges the `dev` / `build` / `preview` scripts, the React dependencies and the Vite /
 *     TypeScript / testing devDependencies into `package.json`. Merge mode — user keys survive.
 *  4. Adds `dist/` to `.gitignore`. Region mode.
 *  5. Seeds the starter source (`index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`,
 *     `src/index.css`; `.jsx` for the JavaScript template). Seed mode — written once, never enforced, so the app is yours to edit.
 */

import { Effect, Predicate } from "effect"
import validatePackageName from "validate-npm-package-name"
import { ignoreSection, jsonMerge, ownFile, seedFile } from "@projitect/blueprint"
import { gitignores } from "@projitect/blueprint-gitignore"
import { tsconfig } from "@projitect/blueprint-tsconfig"
import { vitest } from "@projitect/blueprint-vitest"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS, Errors } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }
import * as templates from "./templates.js"

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` and `pjt inspect` can report a real upgrade.
const PACKAGE_VERSION = manifest.version

const REACT_DEP_RANGE = "^19.2.0"
const VITE_DEP_RANGE = "^7.3.0"
const PLUGIN_REACT_DEP_RANGE = "^5.2.0"
const TYPESCRIPT_DEP_RANGE = "^5.9.0"
const TYPES_REACT_DEP_RANGE = "^19.2.0"
const JSDOM_DEP_RANGE = "^27.4.0"
const TESTING_LIBRARY_REACT_DEP_RANGE = "^16.3.0"
const TESTING_LIBRARY_DOM_DEP_RANGE = "^10.4.0"

/** Which app to scaffold: the Vite / CRA template ids for React + TypeScript and React + JavaScript. */
export type ReactTemplate = "react-ts" | "react"

/**
 * Options for the React blueprint. All optional; `react()` is the same as
 * `react({ template: "react-ts" })`.
 */
export interface ReactOptions {
  /**
   * `"react-ts"` (default) scaffolds a TypeScript app; `"react"` scaffolds a JavaScript app with
   * `.jsx` starter files, `vite.config.js`, no `tsconfig.json`, no TypeScript or `@types/*`
   * devDependencies and a `build` script of `vite build`. Vitest with jsdom and Testing Library
   * are included either way. Switching template later leaves the previous template's owned config
   * file to lockfile-driven removal on the next `pjt remodel`.
   */
  readonly template?: ReactTemplate
  /**
   * The generated app's `package.json` `name` — a valid npm package name such as `my-app` or
   * `@acme/app`. Only the name is set; no paths change, and `react()` still returns a plain
   * `Blueprint`. To put the app in a folder, compose it:
   * `directory("my-app", [react({ name: "my-app" })])` rebases every generated path under
   * `my-app/`. A scoped name is not a valid folder name, so pick a separate directory then.
   * When omitted, the `name` key of `package.json` is left alone.
   */
  readonly name?: string
}

const TEMPLATES: readonly string[] = ["react-ts", "react"]

const invalid = (field: "template" | "name", value: string, problem: string) =>
  new Errors.ReactInvalid({
    id: "pjt.react.invalid-options",
    field,
    value,
    message: `Invalid react() ${field} ${JSON.stringify(value)}: ${problem}.`,
  })

/** First problem with an npm package name, or `undefined`. */
const nameProblem = (name: string): string | undefined => {
  const result = validatePackageName(name)
  return result.validForNewPackages
    ? undefined
    : [...(result.errors ?? []), ...(result.warnings ?? [])].join("; ")
}

const validate = (options: ReactOptions) => {
  const template: unknown = options.template
  const name: unknown = options.name
  const failures = [
    ...(template === undefined || (Predicate.isString(template) && TEMPLATES.includes(template))
      ? []
      : [
          invalid(
            "template",
            globalThis.String(template),
            `must be one of ${TEMPLATES.map((known) => JSON.stringify(known)).join(", ")}`,
          ),
        ]),
    ...(name === undefined
      ? []
      : Predicate.isString(name)
        ? [nameProblem(name)].flatMap((problem) =>
            problem === undefined ? [] : [invalid("name", name, problem)],
          )
        : [invalid("name", globalThis.String(name), "must be a string")]),
  ]
  return failures[0]
}

/**
 * Build the composite React blueprint. Every operation is attributed to its own sub-blueprint
 * (`pjt:tsconfig`, `pjt:vitest`, `pjt:react`, …); removing `react()` from `.pjt.ts` removes the
 * maintained scaffolding and managed keys but leaves the seeded source and the user's own
 * `package.json` keys in place.
 *
 * Takes an optional {@link ReactOptions}: `template` (`"react-ts"` by default, or `"react"` for
 * JavaScript) and `name` (the `package.json` name). Invalid options fail the plan with
 * `pjt.react.invalid-options`.
 */
export const react = (options: ReactOptions = {}): Blueprint.Blueprint => {
  const id = "pjt:react"
  const template = options.template ?? "react-ts"
  const typescript = template === "react-ts"
  const ext = typescript ? "tsx" : "jsx"
  const starterFiles = {
    "index.html": templates.indexHtml(`src/main.${ext}`),
    [`src/main.${ext}`]: templates.mainTsx,
    [`src/App.${ext}`]: typescript ? templates.appTsx : templates.appJsx,
    [`src/App.test.${ext}`]: typescript ? templates.appTestTsx : templates.appTestJsx,
    "src/index.css": templates.indexCss,
  }
  const typeKeys = [
    "devDependencies.@types/react",
    "devDependencies.@types/react-dom",
    "devDependencies.typescript",
  ]

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: typescript
      ? "React scripts, dependencies and Vite / TypeScript devDependencies"
      : "React scripts, dependencies and Vite devDependencies",
    path: "package.json",
    ownedKeys: [
      ...(options.name === undefined ? [] : ["name"]),
      "scripts.dev",
      "scripts.build",
      "scripts.preview",
      "dependencies.react",
      "dependencies.react-dom",
      "devDependencies.@testing-library/dom",
      "devDependencies.@testing-library/react",
      ...(typescript ? typeKeys.slice(0, 2) : []),
      "devDependencies.@vitejs/plugin-react",
      "devDependencies.jsdom",
      ...(typescript ? typeKeys.slice(2) : []),
      "devDependencies.vite",
    ],
    value: {
      ...(options.name === undefined ? {} : { name: options.name }),
      scripts: {
        dev: "vite",
        build: typescript ? "tsc --noEmit && vite build" : "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: REACT_DEP_RANGE,
        "react-dom": REACT_DEP_RANGE,
      },
      devDependencies: {
        "@testing-library/dom": TESTING_LIBRARY_DOM_DEP_RANGE,
        "@testing-library/react": TESTING_LIBRARY_REACT_DEP_RANGE,
        ...(typescript
          ? { "@types/react": TYPES_REACT_DEP_RANGE, "@types/react-dom": TYPES_REACT_DEP_RANGE }
          : {}),
        "@vitejs/plugin-react": PLUGIN_REACT_DEP_RANGE,
        jsdom: JSDOM_DEP_RANGE,
        ...(typescript ? { typescript: TYPESCRIPT_DEP_RANGE } : {}),
        vite: VITE_DEP_RANGE,
      },
    },
  })

  const viteConfig = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "Vite configuration",
    path: typescript ? "vite.config.ts" : "vite.config.js",
    content: templates.viteConfig,
  })

  const gitignoreDist = ignoreSection({
    id,
    version: PACKAGE_VERSION,
    description: "ignore Vite build output",
    path: ".gitignore",
    content: "dist/\n",
  })

  const starter = Object.entries(starterFiles).map(([path, content]) =>
    seedFile({ id, version: PACKAGE_VERSION, description: `starter ${path}`, path, content }),
  )

  const parts = [
    ...(typescript ? [tsconfig({ module: "ESNext", dom: true, jsx: "react-jsx" })] : []),
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
    description: `React + Vite + ${typescript ? "TypeScript" : "JavaScript"} app (config, scripts, dependencies and starter source)`,
    permissions: parts.flatMap((part) => part.permissions),
    plan: Effect.gen(function* () {
      const failure = validate(options)
      if (failure !== undefined) {
        return yield* failure
      }
      const changeSets = yield* Effect.forEach(parts, (part) => part.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}
