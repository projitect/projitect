import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { eslint } from "../src/index.js"
import manifest from "../package.json" with { type: "json" }

/**
 * Unit tests for `@projitect/blueprint-eslint` — `eslint.config()` (merge package.json + owned
 * eslint.config.js) and `eslint.fix()` (post-apply exec). Plans run against the in-memory
 * `BlueprintFileSystem`; the exec runner's permission gate is the engine's contract and is
 * covered in `cli-internals`.
 */

const runPlan = (blueprint: ReturnType<typeof eslint.config>) =>
  Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))))

describe("eslint.config() — default options", () => {
  it("emits exactly two operations: merge and owned, and no exec", async () => {
    const { operations } = await runPlan(eslint.config())
    expect(operations.map((o) => o._tag).toSorted()).toEqual(["Merge", "Owned"])
  })

  it("owns the lint scripts and devDependencies via merge mode", async () => {
    const { operations } = await runPlan(eslint.config())
    const merge = operations.find((o) => o._tag === "Merge")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    expect(merge.path).toBe("package.json")
    expect([...merge.ownedKeys].toSorted()).toEqual([
      "devDependencies.@eslint/js",
      "devDependencies.eslint",
      "devDependencies.typescript-eslint",
      "scripts.lint",
      "scripts.lint:fix",
    ])
    expect(merge.value).toMatchObject({
      scripts: { lint: "eslint .", "lint:fix": "eslint --fix ." },
      devDependencies: { eslint: "^10.0.0", "typescript-eslint": "^8.0.0" },
    })
  })

  it("renders a flat eslint.config.js with the default ignores", async () => {
    const { operations } = await runPlan(eslint.config())
    const owned = operations.find((o) => o._tag === "Owned")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned op")
    }
    expect(owned.path).toBe("eslint.config.js")
    expect(owned.content).toContain('{ ignores: ["dist", "coverage", "node_modules"] }')
    expect(owned.content).toContain("js.configs.recommended")
    expect(owned.content).toContain("...tseslint.configs.recommended")
    expect(owned.content).not.toContain("prettier")
  })

  it("renders byte-identical output on every plan (no drift on re-run)", async () => {
    const first = await runPlan(eslint.config({ ignores: ["build"] }))
    const second = await runPlan(eslint.config({ ignores: ["build"] }))
    expect(second).toEqual(first)
  })

  it("declares read/write on package.json and write on eslint.config.js", () => {
    expect(eslint.config().permissions).toEqual([
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: "eslint.config.js" },
    ])
  })

  it("attributes every op to pjt:eslint", async () => {
    const blueprint = eslint.config()
    expect(blueprint.id).toBe("pjt:eslint")
    const { operations } = await runPlan(blueprint)
    for (const op of operations) {
      expect(op.ownerId).toBe("pjt:eslint")
    }
  })
})

describe("eslint.config() — options", () => {
  it("appends extra ignores to the defaults without duplicates", async () => {
    const { operations } = await runPlan(eslint.config({ ignores: ["build", "dist"] }))
    const owned = operations.find((o) => o._tag === "Owned")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned op")
    }
    expect(owned.content).toContain('{ ignores: ["dist", "coverage", "node_modules", "build"] }')
  })

  it("typescript: false drops typescript-eslint from config and devDeps", async () => {
    const { operations } = await runPlan(eslint.config({ typescript: false }))
    const merge = operations.find((o) => o._tag === "Merge")
    const owned = operations.find((o) => o._tag === "Owned")
    if (merge?._tag !== "Merge" || owned?._tag !== "Owned") {
      throw new Error("expected merge and owned ops")
    }
    expect(merge.ownedKeys).not.toContain("devDependencies.typescript-eslint")
    expect(owned.content).not.toContain("tseslint")
  })

  it('prettier: "config" adds eslint-config-prettier as a dependency and config entry', async () => {
    const { operations } = await runPlan(eslint.config({ prettier: "config" }))
    const merge = operations.find((o) => o._tag === "Merge")
    const owned = operations.find((o) => o._tag === "Owned")
    if (merge?._tag !== "Merge" || owned?._tag !== "Owned") {
      throw new Error("expected merge and owned ops")
    }
    expect(merge.ownedKeys).toContain("devDependencies.eslint-config-prettier")
    expect(owned.content).toContain('import prettier from "eslint-config-prettier"')
    expect(owned.content).toContain("  prettier,")
  })
})

describe("eslint.fix()", () => {
  it("emits a single Exec op with eslint --fix as the fix and eslint . as the check", async () => {
    const { operations } = await runPlan(eslint.fix())
    expect(operations).toHaveLength(1)
    const op = operations[0]
    if (op?._tag !== "Exec") {
      throw new Error("expected exec op")
    }
    expect(op.command).toBe("eslint --fix .")
    expect(op.check).toBe("eslint .")
    expect(op.ownerId).toBe("pjt:eslint-fix")
  })

  it("declares the exec permission for both command lines", () => {
    expect(eslint.fix().permissions).toEqual([
      { kind: "exec", command: "eslint --fix ." },
      { kind: "exec", command: "eslint ." },
    ])
  })
})

describe("version", () => {
  it("reports the installed package manifest version", () => {
    expect(eslint.config().version).toBe(manifest.version)
    expect(eslint.fix().version).toBe(manifest.version)
  })
})
