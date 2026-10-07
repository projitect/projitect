/**
 * @projitect/blueprint-tsconfig
 *
 * One owned-mode blueprint that scaffolds `tsconfig.json` with strict defaults. Designed for the
 * common Node-library / Node-app shape; toggle `dom` for browser code and `jsx` for React/JSX.
 *
 * Owned mode means projitect rewrites `tsconfig.json` from scratch on every `pjt remodel` —
 * the user can't accidentally drift it. If a project needs overrides projitect can't model
 * (e.g. `compilerOptions.paths`), the answer is: configure projitect's options here, then
 * compose a second TS config file (`tsconfig.local.json`) that extends this one and adds the
 * overrides. Don't hand-edit the owned file.
 */

import { ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"

const PACKAGE_VERSION = "0.0.0"

export interface TsconfigOptions {
  /**
   * Strict family of compiler flags. Defaults to `true` (`strict`, `noUncheckedIndexedAccess`,
   * `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`,
   * `exactOptionalPropertyTypes`). Pass `false` to ship the loose defaults TS gives a new
   * project — useful when adopting projitect on a legacy codebase where flipping strict mode
   * at once isn't feasible.
   */
  readonly strict?: boolean
  /** ECMAScript target. Defaults to `"ES2023"`. */
  readonly target?: string
  /** Module system. Defaults to `"NodeNext"` (with matching `moduleResolution`). */
  readonly module?: "NodeNext" | "ESNext" | "Node16" | "CommonJS"
  /**
   * `lib` entries. Defaults to `["ES2023"]` (matches `target`). Use `dom: true` instead of
   * adding `"DOM"` here — the helper handles the right pairing.
   */
  readonly lib?: readonly string[]
  /**
   * Include `"DOM"` + `"DOM.Iterable"` in `lib`. Defaults to `false` (Node-only). Flip to `true`
   * for browser code.
   */
  readonly dom?: boolean
  /**
   * JSX transform. `null` (default) emits no `jsx` field. `"react-jsx"` is the modern automatic
   * runtime; `"react"` is the classic transform; `"preserve"` keeps JSX as-is for downstream
   * tooling (Vite, etc.).
   */
  readonly jsx?: "react" | "react-jsx" | "preserve" | null
  /**
   * Source root. Defaults to `"./src"`. The generated config derives `include` from this
   * (`${rootDir}/...all files...`) and sets `exclude` to `["node_modules", outDir]`.
   */
  readonly rootDir?: string
  /**
   * Output directory. Defaults to `"./dist"`.
   */
  readonly outDir?: string
  /**
   * Project references for a `tsc -b` solution-style build. Each entry is a path to a
   * referenced project (a directory or a tsconfig file), written verbatim as `{ path: entry }`
   * in the given order. Omit or leave empty to emit no `references` field. Each referenced
   * project's own tsconfig must set `compilerOptions.composite: true`.
   */
  readonly references?: readonly string[]
}

/**
 * Build the tsconfig blueprint. Returns an owned-mode blueprint that emits a single operation
 * writing `tsconfig.json` with the rendered content.
 */
export const tsconfig = (options: TsconfigOptions = {}): Blueprint.Blueprint =>
  ownFile({
    id: "pjt:tsconfig",
    version: PACKAGE_VERSION,
    description: "TypeScript tsconfig.json with strict defaults",
    path: "tsconfig.json",
    content: renderTsconfig(options),
  })

const renderTsconfig = (options: TsconfigOptions): string => {
  const strict = options.strict ?? true
  const target = options.target ?? "ES2023"
  const module_ = options.module ?? "NodeNext"
  const baseLib = options.lib ?? [target]
  const lib = options.dom === true ? [...baseLib, "DOM", "DOM.Iterable"] : baseLib
  const rootDir = options.rootDir ?? "./src"
  const outDir = options.outDir ?? "./dist"
  const jsx = options.jsx ?? null
  const references = options.references ?? []

  const config: Record<string, unknown> = {
    compilerOptions: {
      target,
      module: module_,
      moduleResolution: moduleResolutionFor(module_),
      lib,
      ...(jsx !== null && { jsx }),
      rootDir,
      outDir,
      // Always-on hygiene flags. These don't toggle with `strict` — they're the table stakes
      // every modern TS project should have.
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      isolatedModules: true,
      resolveJsonModule: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      ...(strict && {
        strict: true,
        noImplicitOverride: true,
        noFallthroughCasesInSwitch: true,
        noUncheckedIndexedAccess: true,
        noPropertyAccessFromIndexSignature: true,
        exactOptionalPropertyTypes: true,
      }),
    },
    include: [`${stripDot(rootDir)}/**/*`],
    exclude: ["node_modules", stripDot(outDir)],
    ...(references.length > 0 && { references: references.map((path) => ({ path })) }),
  }

  return `${JSON.stringify(config, null, 2)}\n`
}

const moduleResolutionFor = (m: TsconfigOptions["module"]): string => {
  switch (m) {
    case "NodeNext":
    case "Node16": {
      return m
    }
    case "ESNext": {
      return "Bundler"
    }
    case "CommonJS": {
      return "Node"
    }
    default: {
      return "NodeNext"
    }
  }
}

const stripDot = (p: string): string => (p.startsWith("./") ? p.slice(2) : p)
