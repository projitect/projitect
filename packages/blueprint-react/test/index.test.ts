import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import manifest from "../package.json" with { type: "json" }
import { react } from "../src/index.js"

/**
 * Unit tests for `@projitect/blueprint-react` — the composite that scaffolds a React + Vite +
 * TypeScript app. The plan runs against the in-memory `BlueprintFileSystem` from
 * `@projitect/test-kit`; the assertions check the emitted operations, which is the contract the
 * planner / applier relies on. The full build → inspect → remodel → remove lifecycle is covered in
 * `packages/cli-internals/test/react-lifecycle.test.ts`.
 */

const runPlan = () => Effect.runPromise(react().plan.pipe(Effect.provide(makeInMemoryLayer({}))))

const STARTER_PATHS = [
  "index.html",
  "src/App.test.tsx",
  "src/App.tsx",
  "src/index.css",
  "src/main.tsx",
]

describe("react()", () => {
  it("has one composite id", () => {
    expect(react().id).toBe("pjt:react")
  })

  it("takes its version from the package manifest, so a release bump reaches the lockfile", () => {
    expect(react().version).toBe(manifest.version)
  })

  it("seeds exactly the starter source", async () => {
    const { operations } = await runPlan()
    const seeds = operations.filter((o) => o._tag === "Seed")
    expect(seeds.map((o) => o.path).toSorted()).toEqual(STARTER_PATHS)
  })

  it("owns tsconfig.json, vitest.config.ts and vite.config.ts", async () => {
    const { operations } = await runPlan()
    const owned = operations.filter((o) => o._tag === "Owned")
    expect(owned.map((o) => o.path).toSorted()).toEqual([
      "tsconfig.json",
      "vite.config.ts",
      "vitest.config.ts",
    ])
  })

  it("renders a tsconfig for the DOM with the react-jsx transform", async () => {
    const { operations } = await runPlan()
    const owned = operations.find((o) => o._tag === "Owned" && o.path === "tsconfig.json")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned tsconfig op")
    }
    expect(owned.content).toContain('"jsx": "react-jsx"')
    expect(owned.content).toContain('"DOM"')
    expect(owned.content).toContain('"moduleResolution": "Bundler"')
  })

  it("registers the React plugin in vite.config.ts and keeps the test block in vitest.config.ts", async () => {
    const { operations } = await runPlan()
    const content = (path: string) => {
      const owned = operations.find((o) => o._tag === "Owned" && o.path === path)
      if (owned?._tag !== "Owned") {
        throw new Error(`expected owned op for ${path}`)
      }
      return owned.content
    }
    expect(content("vite.config.ts")).toContain("plugins: [react()]")
    expect(content("vite.config.ts")).not.toContain("test:")
    expect(content("vitest.config.ts")).toContain('environment: "jsdom"')
  })

  it("merges the React scripts and dependencies into package.json without a key collision", async () => {
    const { operations } = await runPlan()
    const merges = operations.filter((o) => o._tag === "Merge")
    expect(merges.every((o) => o.path === "package.json")).toBe(true)
    const keys = merges.flatMap((o) => [...o.ownedKeys])
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(
      expect.arrayContaining([
        "scripts.dev",
        "scripts.build",
        "scripts.preview",
        "scripts.test",
        "dependencies.react",
        "dependencies.react-dom",
        "devDependencies.vite",
        "devDependencies.@vitejs/plugin-react",
        "devDependencies.vitest",
      ]),
    )
  })

  it("claims .gitignore regions for the node section and dist/", async () => {
    const { operations } = await runPlan()
    const regions = operations.filter((o) => o._tag === "Region")
    expect(regions.map((o) => o.ownerId)).toEqual(
      expect.arrayContaining(["pjt:gitignore:node", "pjt:react"]),
    )
    expect(regions.find((o) => o.ownerId === "pjt:react")?.content).toBe("dist/\n")
  })

  it("declares a permission for every path it writes", async () => {
    const blueprint = react()
    const { operations } = await Effect.runPromise(
      blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))),
    )
    const writable = new Set(
      blueprint.permissions.flatMap((p) => (p.kind === "write" ? [p.glob] : [])),
    )
    const paths = operations.flatMap((op) => (op._tag === "Exec" ? [] : [op.path]))
    expect(paths.every((path) => writable.has(path))).toBe(true)
  })
})
