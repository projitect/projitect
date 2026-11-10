import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { describe, expect, it } from "vitest"
import { gitignores } from "../src/index.js"
import type { GitignoreSection } from "../src/index.js"
import manifest from "../package.json" with { type: "json" }

/**
 * Unit tests for `@projitect/blueprint-gitignore`. Every section is a region blueprint whose
 * version must follow the installed package manifest, so a release bump reaches `.pjt.lock`.
 * Composing every section into one `.gitignore` is covered in
 * `packages/cli-internals/test/gitignore-lifecycle.test.ts`.
 */

// Exhaustive: a section added to `gitignores` without an entry here fails typechecking.
const EXPECTED_IDS = {
  macOs: "macos",
  windows: "windows",
  linux: "linux",
  node: "node",
  next: "next",
  vscode: "vscode",
  jetbrains: "jetbrains",
  tsbuildinfo: "tsbuildinfo",
  vite: "vite",
  astro: "astro",
  nuxt: "nuxt",
  svelteKit: "sveltekit",
  angular: "angular",
  vue: "vue",
  storybook: "storybook",
  yarn: "yarn",
  pnpm: "pnpm",
  vim: "vim",
  sublimeText: "sublime-text",
  eclipse: "eclipse",
} as const satisfies Record<GitignoreSection, string>

const names = Object.keys(EXPECTED_IDS) as GitignoreSection[]

const planRegion = async (name: GitignoreSection) => {
  const { operations } = await Effect.runPromise(
    gitignores[name]().plan.pipe(Effect.provide(makeInMemoryLayer({}))),
  )
  const [op] = operations
  if (operations.length !== 1 || op?._tag !== "Region") {
    throw new Error("expected one region op")
  }
  return op
}

const ruleLines = (content: string) =>
  content.split("\n").filter((line) => line !== "" && !line.startsWith("#"))

describe("gitignores — identity", () => {
  it.each(names)("%s has a stable id and reports the installed manifest version", (name) => {
    const blueprint = gitignores[name]()
    expect(blueprint.id).toBe(`pjt:gitignore:${EXPECTED_IDS[name]}`)
    expect(blueprint.version).toBe(manifest.version)
  })

  it("exposes exactly the sections the package manifest advertises to `pjt add --section`", () => {
    expect(Object.keys(gitignores).toSorted()).toEqual([...manifest.projitect.sections].toSorted())
  })
})

describe("gitignores — emitted operation", () => {
  it.each(names)("%s emits a `#`-fenced region op on .gitignore", async (name) => {
    const op = await planRegion(name)
    expect(op.ownerId).toBe(`pjt:gitignore:${EXPECTED_IDS[name]}`)
    expect(op.path).toBe(".gitignore")
    expect(op.commentPrefix).toBe("#")
    expect(op.content.endsWith("\n")).toBe(true)
  })

  it.each(names.filter((name) => name !== "vscode" && name !== "tsbuildinfo"))(
    "%s never ignores lockfiles, tsconfig or .vscode",
    async (name) => {
      const { content } = await planRegion(name)
      for (const rule of ruleLines(content)) {
        expect(rule).not.toMatch(
          /yarn\.lock|pnpm-lock|package-lock|\.pjt\.lock|\*\.lock|tsconfig|tsbuildinfo|\.vscode/u,
        )
      }
    },
  )
})
