import { describe, expect, it } from "vitest"
import { Effect, Schema } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { changesets } from "../src/index.js"
import manifest from "../package.json" with { type: "json" }

/**
 * Unit tests for `@projitect/blueprint-changesets` — the composite blueprint that wires Changesets
 * release tooling into a project (merge package.json, owned .changeset/config.json).
 *
 * The blueprint's `plan` Effect runs against the in-memory `BlueprintFileSystem` from
 * `@projitect/test-kit`; the assertions check the emitted operations, which is the contract
 * `cli-internals`' planner / applier relies on.
 */

const runPlan = (blueprint: ReturnType<typeof changesets>) =>
  Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))))

const planConfig = async (options: Parameters<typeof changesets>[0]) => {
  const { operations } = await runPlan(changesets(options))
  const owned = operations.find((o) => o._tag === "Owned")
  if (owned?._tag !== "Owned") {
    throw new Error("expected owned op")
  }
  const config = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
    JSON.parse(owned.content),
  )
  return { owned, config }
}

describe("changesets() — default options", () => {
  it("emits exactly two operations: merge and owned", async () => {
    const { operations } = await runPlan(changesets())
    expect(operations).toHaveLength(2)
    expect(operations.map((o) => o._tag).toSorted()).toEqual(["Merge", "Owned"])
  })

  it("attributes every op to pjt:changesets", async () => {
    const blueprint = changesets()
    expect(blueprint.id).toBe("pjt:changesets")
    const { operations } = await runPlan(blueprint)
    for (const op of operations) {
      expect(op.ownerId).toBe("pjt:changesets")
    }
  })

  it("owns .changeset/config.json with the `changeset init` defaults", async () => {
    const { owned, config } = await planConfig(undefined)
    expect(owned.path).toBe(".changeset/config.json")
    expect(owned.content.endsWith("\n")).toBe(true)
    expect(config).toEqual({
      $schema: "https://unpkg.com/@changesets/config@3.1.1/schema.json",
      changelog: "@changesets/cli/changelog",
      commit: false,
      fixed: [],
      linked: [],
      access: "restricted",
      baseBranch: "main",
      updateInternalDependencies: "patch",
      ignore: [],
    })
  })

  it("owns the three package.json keys via merge mode", async () => {
    const { operations } = await runPlan(changesets())
    const merge = operations.find((o) => o._tag === "Merge")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    expect(merge.path).toBe("package.json")
    expect([...merge.ownedKeys].toSorted()).toEqual([
      "devDependencies.@changesets/cli",
      "scripts.changeset",
      "scripts.version-packages",
    ])
    expect(merge.value).toEqual({
      scripts: { changeset: "changeset", "version-packages": "changeset version" },
      devDependencies: { "@changesets/cli": "^2.0.0" },
    })
  })

  it("asks only for package.json read/write and .changeset/config.json write", () => {
    expect(changesets().permissions).toEqual([
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: ".changeset/config.json" },
    ])
  })
})

describe("changesets() — option overrides", () => {
  it("overrides baseBranch", async () => {
    const { config } = await planConfig({ baseBranch: "develop" })
    expect(config["baseBranch"]).toBe("develop")
  })

  it("overrides access", async () => {
    const { config } = await planConfig({ access: "public" })
    expect(config["access"]).toBe("public")
  })

  it("overrides fixed, linked and ignore", async () => {
    const { config } = await planConfig({
      fixed: [["@a/one", "@a/two"]],
      linked: [["@b/one", "@b/two"]],
      ignore: ["@c/internal"],
    })
    expect(config["fixed"]).toEqual([["@a/one", "@a/two"]])
    expect(config["linked"]).toEqual([["@b/one", "@b/two"]])
    expect(config["ignore"]).toEqual(["@c/internal"])
  })

  it("accepts a changelog generator name", async () => {
    const { config } = await planConfig({ changelog: "@changesets/changelog-github" })
    expect(config["changelog"]).toBe("@changesets/changelog-github")
  })

  it("accepts a [name, options] changelog tuple", async () => {
    const { config } = await planConfig({
      changelog: ["@changesets/changelog-github", { repo: "acme/widgets" }],
    })
    expect(config["changelog"]).toEqual(["@changesets/changelog-github", { repo: "acme/widgets" }])
  })

  it("accepts changelog: false", async () => {
    const { config } = await planConfig({ changelog: false })
    expect(config["changelog"]).toBe(false)
  })

  it("keeps defaults for options that are not given", async () => {
    const { config } = await planConfig({ access: "public" })
    expect(config["baseBranch"]).toBe("main")
    expect(config["changelog"]).toBe("@changesets/cli/changelog")
    expect(config["ignore"]).toEqual([])
  })
})

describe("changesets() — idempotence", () => {
  it("plans identical operations on every run", async () => {
    const first = await runPlan(changesets({ access: "public" }))
    const second = await runPlan(changesets({ access: "public" }))
    expect(second).toEqual(first)
  })
})

describe("changesets() — version", () => {
  it("reports the installed package manifest version", () => {
    expect(changesets().version).toBe(manifest.version)
  })
})
