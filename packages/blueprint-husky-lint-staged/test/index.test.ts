import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { huskyLintStaged } from "../src/index.js"

/**
 * Unit tests for `@projitect/blueprint-husky-lint-staged` — the composite blueprint that wires
 * commit-time checks into a project (merge package.json, owned .husky/pre-commit).
 *
 * The blueprint's `plan` Effect runs against the in-memory `BlueprintFileSystem` from
 * `@projitect/test-kit`; the assertions check the emitted operations, which is the contract
 * `cli-internals`' planner / applier relies on.
 */

const runPlan = (
  blueprint: ReturnType<typeof huskyLintStaged>,
  files: Readonly<Record<string, string>> = {},
) => Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer(files))))

const planOps = async (
  options?: Parameters<typeof huskyLintStaged>[0],
  files: Readonly<Record<string, string>> = {},
) => {
  const { operations } = await runPlan(huskyLintStaged(options), files)
  const owned = operations.find((o) => o._tag === "Owned")
  const merge = operations.find((o) => o._tag === "Merge")
  if (owned?._tag !== "Owned" || merge?._tag !== "Merge") {
    throw new Error("expected owned and merge ops")
  }
  return { operations, owned, merge }
}

describe("huskyLintStaged() — default options", () => {
  it("emits exactly two operations: merge and owned", async () => {
    const { operations } = await runPlan(huskyLintStaged())
    expect(operations.map((o) => o._tag).toSorted()).toEqual(["Merge", "Owned"])
  })

  it("attributes every op to pjt:husky-lint-staged", async () => {
    const blueprint = huskyLintStaged()
    expect(blueprint.id).toBe("pjt:husky-lint-staged")
    const { operations } = await runPlan(blueprint)
    for (const op of operations) {
      expect(op.ownerId).toBe("pjt:husky-lint-staged")
    }
  })

  it("owns .husky/pre-commit running lint-staged, without husky 8 bootstrap", async () => {
    const { owned } = await planOps()
    expect(owned.path).toBe(".husky/pre-commit")
    expect(owned.content).toBe("lint-staged\n")
    expect(owned.content).not.toContain("husky.sh")
  })

  it("owns exactly the four package.json keys via merge mode", async () => {
    const { merge } = await planOps()
    expect(merge.path).toBe("package.json")
    expect([...merge.ownedKeys].toSorted()).toEqual([
      "devDependencies.husky",
      "devDependencies.lint-staged",
      "lint-staged",
      "scripts.prepare",
    ])
    expect(merge.value).toEqual({
      "lint-staged": {
        "*.{js,jsx,ts,tsx,mjs,cjs}": "eslint --fix",
        "*.{json,md,mdx,yml,yaml,css}": "prettier --write",
      },
      scripts: { prepare: "husky" },
      devDependencies: { husky: "^9.0.0", "lint-staged": "^16.0.0" },
    })
  })

  it("asks only for package.json read/write and .husky/pre-commit write", () => {
    expect(huskyLintStaged().permissions).toEqual([
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: ".husky/pre-commit" },
    ])
  })
})

describe("huskyLintStaged() — existing project", () => {
  it("plans the same operations when package.json has unrelated keys", async () => {
    const files = {
      "package.json": JSON.stringify({ name: "acme", scripts: { build: "tsc" } }),
    }
    const clean = await planOps()
    const existing = await planOps(undefined, files)
    expect(existing.merge.ownedKeys).toEqual(clean.merge.ownedKeys)
    expect(existing.merge.value).toEqual(clean.merge.value)
  })

  it("plans identical operations on every run", async () => {
    const first = await runPlan(huskyLintStaged())
    const second = await runPlan(huskyLintStaged())
    expect(second).toEqual(first)
  })

  it("plans different content when the hook or owned values change", async () => {
    const base = await planOps()
    const other = await planOps({ config: { "*.ts": "eslint" } })
    expect(other.owned).toEqual(base.owned)
    expect(other.merge.value).not.toEqual(base.merge.value)
  })
})

describe("huskyLintStaged() — config override", () => {
  it("replaces the default config instead of merging with it", async () => {
    const { merge } = await planOps({ config: { "*.ts": ["eslint --fix", "prettier --write"] } })
    expect(merge.value).toEqual({
      "lint-staged": { "*.ts": ["eslint --fix", "prettier --write"] },
      scripts: { prepare: "husky" },
      devDependencies: { husky: "^9.0.0", "lint-staged": "^16.0.0" },
    })
  })
})
