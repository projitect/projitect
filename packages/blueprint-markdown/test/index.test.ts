import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { markdownSnippets } from "../src/index.js"
import type { MarkdownSnippet } from "../src/index.js"
import manifest from "../package.json" with { type: "json" }

/**
 * Unit tests for `@projitect/blueprint-markdown` — the composable AGENTS.md / README.md snippets.
 * The blueprints' `plan` Effects run against the in-memory `BlueprintFileSystem`; the assertions
 * check the emitted operations, which is the contract `cli-internals`' planner relies on. The full
 * install → remodel → upgrade → remove lifecycle lives in
 * `packages/cli-internals/test/markdown-lifecycle.test.ts` (it needs a real temp directory).
 */

const runPlan = (blueprint: ReturnType<(typeof markdownSnippets)[MarkdownSnippet]>) =>
  Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))))

const EXPECTED = {
  agentsPackageManager: { id: "pjt:markdown:agents:package-manager", path: "AGENTS.md" },
  agentsVerification: { id: "pjt:markdown:agents:verification", path: "AGENTS.md" },
  agentsCommits: { id: "pjt:markdown:agents:commits", path: "AGENTS.md" },
  agentsNoDestructiveShortcuts: {
    id: "pjt:markdown:agents:no-destructive-shortcuts",
    path: "AGENTS.md",
  },
  readmeContributing: { id: "pjt:markdown:readme:contributing", path: "README.md" },
  readmeLicense: { id: "pjt:markdown:readme:license", path: "README.md" },
} as const satisfies Record<MarkdownSnippet, { readonly id: string; readonly path: string }>

const names = Object.keys(EXPECTED) as MarkdownSnippet[]

describe("markdownSnippets — identity", () => {
  it.each(names)("%s has a stable namespaced id and targets its file", (name) => {
    const blueprint = markdownSnippets[name]()
    expect(blueprint.id).toBe(EXPECTED[name].id)
    expect(blueprint.version).toBe("0.0.0")
  })

  it("exposes exactly the snippets the package manifest advertises to `pjt add --section`", () => {
    expect(Object.keys(markdownSnippets).toSorted()).toEqual(
      [...manifest.projitect.sections].toSorted(),
    )
  })

  it("never reuses an owner id", () => {
    const ids = names.map((name) => markdownSnippets[name]().id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("markdownSnippets — emitted operation", () => {
  it.each(names)("%s emits one HTML-comment-fenced region op", async (name) => {
    const { operations } = await runPlan(markdownSnippets[name]())
    expect(operations).toHaveLength(1)
    const [op] = operations
    if (op?._tag !== "Region") {
      throw new Error("expected region op")
    }
    expect(op.ownerId).toBe(EXPECTED[name].id)
    expect(op.path).toBe(EXPECTED[name].path)
    expect(op.commentPrefix).toBe("<!--")
    expect(op.commentSuffix).toBe(" -->")
    expect(op.content.endsWith("\n")).toBe(true)
  })
})

describe("markdownSnippets — version and content overrides", () => {
  it("changes version and content without changing the owner id", async () => {
    const base = markdownSnippets.agentsVerification()
    const upgraded = markdownSnippets.agentsVerification({
      version: "1.1.0",
      content: "## Verification\n\nRun everything.\n",
    })
    expect(upgraded.version).toBe("1.1.0")
    expect(upgraded.id).toBe(base.id)
    const { operations } = await runPlan(upgraded)
    const [op] = operations
    if (op?._tag !== "Region") {
      throw new Error("expected region op")
    }
    expect(op.content).toBe("## Verification\n\nRun everything.\n")
  })
})

describe("markdownSnippets — determinism", () => {
  it.each(names)("%s plans identical operations on every run", async (name) => {
    expect(await runPlan(markdownSnippets[name]())).toEqual(await runPlan(markdownSnippets[name]()))
  })
})
