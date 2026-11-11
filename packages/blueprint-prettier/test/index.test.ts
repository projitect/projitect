import { describe, expect, it } from "vitest"
import { Effect, Schema } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { prettier } from "../src/index.js"
import manifest from "../package.json" with { type: "json" }

/**
 * Unit tests for `@projitect/blueprint-prettier` — `prettier.config()` (owned config + merged
 * package.json keys) and `prettier.fix()` (post-apply exec operation). Plans run against the
 * in-memory `BlueprintFileSystem` from `@projitect/test-kit`.
 */

const runPlan = (blueprint: ReturnType<typeof prettier.config>) =>
  Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))))

const planConfig = async (options: Parameters<typeof prettier.config>[0]) => {
  const { operations } = await runPlan(prettier.config(options))
  const owned = operations.find((o) => o._tag === "Owned")
  if (owned?._tag !== "Owned") {
    throw new Error("expected owned op")
  }
  const parsed = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
    JSON.parse(owned.content),
  )
  return { owned, parsed }
}

describe("prettier.config() — default options", () => {
  it("emits exactly two operations: merge and owned", async () => {
    const { operations } = await runPlan(prettier.config())
    expect(operations.map((o) => o._tag).toSorted()).toEqual(["Merge", "Owned"])
    for (const op of operations) {
      expect(op.ownerId).toBe("pjt:prettier")
    }
  })

  it("owns .prettierrc.json with an empty config and a trailing newline", async () => {
    const { owned, parsed } = await planConfig(undefined)
    expect(owned.path).toBe(".prettierrc.json")
    expect(owned.content.endsWith("\n")).toBe(true)
    expect(parsed).toEqual({})
  })

  it("owns the format script and prettier devDependency via merge mode", async () => {
    const { operations } = await runPlan(prettier.config())
    const merge = operations.find((o) => o._tag === "Merge")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    expect(merge.path).toBe("package.json")
    expect([...merge.ownedKeys].toSorted()).toEqual(["devDependencies.prettier", "scripts.format"])
    expect(merge.value).toEqual({
      scripts: { format: "prettier --write ." },
      devDependencies: { prettier: manifest.dependencies.prettier },
    })
  })

  it("asks only for package.json read/write and .prettierrc.json write", () => {
    expect(prettier.config().permissions).toEqual([
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: ".prettierrc.json" },
    ])
  })
})

describe("prettier.config() — options", () => {
  it("writes the supplied options and nothing else", async () => {
    const { parsed } = await planConfig({
      semi: false,
      singleQuote: true,
      printWidth: 100,
      tabWidth: 4,
      trailingComma: "all",
      proseWrap: "always",
    })
    expect(parsed).toEqual({
      semi: false,
      singleQuote: true,
      printWidth: 100,
      tabWidth: 4,
      trailingComma: "all",
      proseWrap: "always",
    })
  })

  it("omits options that are not given", async () => {
    const { parsed } = await planConfig({ semi: false })
    expect(parsed).toEqual({ semi: false })
  })
})

describe("prettier.config() — against an existing project", () => {
  it("plans managed content for a hand-edited config", async () => {
    const layer = makeInMemoryLayer({ ".prettierrc.json": '{ "semi": true }' })
    const { operations } = await Effect.runPromise(
      prettier.config({ semi: false }).plan.pipe(Effect.provide(layer)),
    )
    const owned = operations.find((o) => o._tag === "Owned")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned op")
    }
    expect(JSON.parse(owned.content)).toEqual({ semi: false })
  })

  it("claims only the managed script and dependency keys", async () => {
    const existing = JSON.stringify({
      scripts: { test: "vitest run" },
      devDependencies: { vitest: "^3.0.0" },
    })
    const layer = makeInMemoryLayer({ "package.json": existing })
    const { operations } = await Effect.runPromise(
      prettier.config().plan.pipe(Effect.provide(layer)),
    )
    const merge = operations.find((o) => o._tag === "Merge")
    if (merge?._tag !== "Merge") {
      throw new Error("expected merge op")
    }
    // Merge mode touches only the owned keys; everything else in the file is preserved by the applier.
    expect([...merge.ownedKeys].toSorted()).toEqual(["devDependencies.prettier", "scripts.format"])
    expect(merge.value).not.toHaveProperty("scripts.test")
    expect(merge.value).not.toHaveProperty("devDependencies.vitest")
  })
})

describe("prettier.fix()", () => {
  const planExec = async () => {
    const blueprint = prettier.fix()
    const { operations } = await runPlan(blueprint)
    const op = operations[0]
    if (operations.length !== 1 || op?._tag !== "Exec") {
      throw new Error("expected a single exec op")
    }
    return { blueprint, op }
  }

  it("plans one exec op: --write as the fix, --check as the check", async () => {
    const { blueprint, op } = await planExec()
    expect(blueprint.id).toBe("pjt:prettier:fix")
    expect(op.ownerId).toBe("pjt:prettier:fix")
    expect(op.command).toContain("prettier --write")
    expect(op.check).toContain("prettier --check")
  })

  it("declares an exec permission for exactly the two command lines", async () => {
    const { blueprint, op } = await planExec()
    expect(blueprint.permissions).toEqual([
      { kind: "exec", command: op.command },
      { kind: "exec", command: op.check },
    ])
  })

  it("uses the shared runner's project-local executable lookup", async () => {
    const { op } = await planExec()
    expect(op.command).toBe("prettier --write .")
    expect(op.check).toBe("prettier --check .")
  })
})

describe("prettier — idempotence and version", () => {
  it("plans identical operations on every run", async () => {
    expect(await runPlan(prettier.config({ semi: false }))).toEqual(
      await runPlan(prettier.config({ semi: false })),
    )
  })

  it("reports the installed package manifest version", () => {
    expect(prettier.config().version).toBe(manifest.version)
    expect(prettier.fix().version).toBe(manifest.version)
  })

  it("reports invalid formatter options as a typed planning failure", async () => {
    const result = await Effect.runPromise(
      prettier
        .config({ tabWidth: -1 })
        .plan.pipe(Effect.result, Effect.provide(makeInMemoryLayer({}))),
    )
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { id: "pjt.prettier.invalid-options" },
    })
  })
})
