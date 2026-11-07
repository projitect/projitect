import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { vitest } from "../src/index.js"
import manifest from "../package.json" with { type: "json" }

/**
 * Unit tests for `@projitect/blueprint-vitest` — the composite blueprint that wires vitest into
 * a project (merge package.json, owned vitest.config.ts, region in .gitignore).
 *
 * The blueprint's `plan` Effect runs against the in-memory `BlueprintFileSystem` from
 * `@projitect/test-kit` so we don't need real disk. The assertions check that the emitted
 * operations have the right shape — that's the contract `cli-internals`' planner / applier relies
 * on. Behavior (regions appearing in `.gitignore` etc.) is covered by the end-to-end smoke
 * script.
 */

const runPlan = (blueprint: ReturnType<typeof vitest>) =>
  Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))))

describe("vitest() — default options", () => {
  it("emits exactly three operations: merge, owned, region (coverage default = v8)", async () => {
    const { operations } = await runPlan(vitest())
    expect(operations).toHaveLength(3)
    expect(operations.map((o) => o._tag).toSorted()).toEqual(["Merge", "Owned", "Region"])
  })

  it("owns the canonical four package.json keys via merge mode", async () => {
    const { operations } = await runPlan(vitest())
    const merge = operations.find((o) => o._tag === "Merge")
    expect(merge?.path).toBe("package.json")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    expect([...merge.ownedKeys].toSorted()).toEqual([
      "devDependencies.@vitest/coverage-v8",
      "devDependencies.vitest",
      "scripts.test",
      "scripts.test:watch",
    ])
  })

  it("ships sensible script defaults in the merge value", async () => {
    const { operations } = await runPlan(vitest())
    const merge = operations.find((o) => o._tag === "Merge")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    expect(merge.value).toMatchObject({
      scripts: { test: "vitest run", "test:watch": "vitest" },
    })
  })

  it("renders a vitest.config.ts that compiles to a valid module shape", async () => {
    const { operations } = await runPlan(vitest())
    const owned = operations.find((o) => o._tag === "Owned")
    expect(owned?.path).toBe("vitest.config.ts")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned op")
    }
    expect(owned.content).toContain('import { defineConfig } from "vitest/config"')
    expect(owned.content).toContain("export default defineConfig({")
    expect(owned.content).toContain('environment: "node"')
    expect(owned.content).toContain("passWithNoTests: true")
    expect(owned.content).toContain('provider: "v8"')
  })

  it("adds `coverage/` to .gitignore via a region op", async () => {
    const { operations } = await runPlan(vitest())
    const region = operations.find((o) => o._tag === "Region")
    expect(region?.path).toBe(".gitignore")
    if (region?._tag !== "Region") {
      throw new Error("expected region op")
    }
    expect(region.commentPrefix).toBe("#")
    expect(region.content).toBe("coverage/\n")
    expect(region.ownerId).toBe("pjt:vitest")
  })

  it("attributes every op to the same blueprint id (pjt:vitest) for lockfile coherence", async () => {
    const blueprint = vitest()
    expect(blueprint.id).toBe("pjt:vitest")
    const { operations } = await runPlan(blueprint)
    for (const op of operations) {
      expect(op.ownerId).toBe("pjt:vitest")
    }
  })
})

describe("vitest() — coverage: null", () => {
  it("drops the coverage devDep, the coverage section in the config, and the .gitignore region", async () => {
    const { operations } = await runPlan(vitest({ coverage: null }))
    expect(operations).toHaveLength(2)
    expect(operations.map((o) => o._tag).toSorted()).toEqual(["Merge", "Owned"])

    const merge = operations.find((o) => o._tag === "Merge")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    expect(merge.ownedKeys).not.toContain("devDependencies.@vitest/coverage-v8")

    const owned = operations.find((o) => o._tag === "Owned")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned op")
    }
    expect(owned.content).not.toContain('provider: "v8"')
  })
})

describe("vitest() — custom scriptName", () => {
  it("renames both script keys in tandem (foo + foo:watch)", async () => {
    const { operations } = await runPlan(vitest({ scriptName: "spec" }))
    const merge = operations.find((o) => o._tag === "Merge")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    expect([...merge.ownedKeys].toSorted()).toContain("scripts.spec")
    expect([...merge.ownedKeys].toSorted()).toContain("scripts.spec:watch")
    expect(merge.value).toMatchObject({
      scripts: { spec: "vitest run", "spec:watch": "vitest" },
    })
  })
})

describe("vitest() — jsdom environment", () => {
  it("flips the environment in the rendered config", async () => {
    const { operations } = await runPlan(vitest({ environment: "jsdom" }))
    const owned = operations.find((o) => o._tag === "Owned")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned op")
    }
    expect(owned.content).toContain('environment: "jsdom"')
  })
})

describe("vitest() — version", () => {
  it("reports the installed package manifest version", () => {
    expect(vitest().version).toBe(manifest.version)
  })
})
