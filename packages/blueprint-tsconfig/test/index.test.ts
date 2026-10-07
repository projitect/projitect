import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { tsconfig } from "../src/index.js"

/**
 * Unit tests for `@projitect/blueprint-tsconfig`. The blueprint emits a single owned-mode op
 * writing `tsconfig.json` — we parse the rendered content as JSON and assert on the resulting
 * object shape. The blueprint's `plan` runs against the in-memory `BlueprintFileSystem` from
 * `@projitect/test-kit`, same pattern as `@projitect/blueprint-vitest`'s suite.
 */

const planJson = (blueprint: ReturnType<typeof tsconfig>) =>
  Effect.runPromise(
    blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))).pipe(
      Effect.map((cs) => {
        const op = cs.operations[0]
        if (op?._tag !== "Owned") {
          throw new Error("expected one owned op")
        }
        const parsed: unknown = JSON.parse(op.content)
        return {
          path: op.path,
          ownerId: op.ownerId,
          // Narrow on read in each assertion — the runtime check is the parse + the test
          // expectations. Casting once at the helper edge keeps the call-site readable.
          json: parsed as {
            compilerOptions: Record<string, unknown>
            include: readonly string[]
            exclude: readonly string[]
          },
        }
      }),
    ),
  )

describe("tsconfig() — defaults", () => {
  it("emits exactly one owned op for tsconfig.json", async () => {
    const { path, ownerId } = await planJson(tsconfig())
    expect(path).toBe("tsconfig.json")
    expect(ownerId).toBe("pjt:tsconfig")
  })

  it("ships the strict family by default", async () => {
    const { json } = await planJson(tsconfig())
    expect(json.compilerOptions).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      noFallthroughCasesInSwitch: true,
      noPropertyAccessFromIndexSignature: true,
      exactOptionalPropertyTypes: true,
    })
  })

  it("targets ES2023 / NodeNext / lib ES2023 / no DOM by default", async () => {
    const { json } = await planJson(tsconfig())
    expect(json.compilerOptions).toMatchObject({
      target: "ES2023",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2023"],
    })
    expect(json.compilerOptions.jsx).toBeUndefined()
  })

  it("always-on hygiene flags are present regardless of strict", async () => {
    const { json } = await planJson(tsconfig())
    expect(json.compilerOptions).toMatchObject({
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      isolatedModules: true,
      resolveJsonModule: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
    })
  })

  it("rootDir/outDir/include/exclude line up out of the box", async () => {
    const { json } = await planJson(tsconfig())
    expect(json.compilerOptions.rootDir).toBe("./src")
    expect(json.compilerOptions.outDir).toBe("./dist")
    expect(json.include).toEqual(["src/**/*"])
    expect(json.exclude).toEqual(["node_modules", "dist"])
  })
})

describe("tsconfig() — strict: false", () => {
  it("drops the strict-family flags but keeps hygiene flags", async () => {
    const { json } = await planJson(tsconfig({ strict: false }))
    expect(json.compilerOptions.strict).toBeUndefined()
    expect(json.compilerOptions.noUncheckedIndexedAccess).toBeUndefined()
    expect(json.compilerOptions.exactOptionalPropertyTypes).toBeUndefined()
    expect(json.compilerOptions.esModuleInterop).toBe(true)
    expect(json.compilerOptions.skipLibCheck).toBe(true)
  })
})

describe("tsconfig() — dom: true", () => {
  it("appends DOM + DOM.Iterable to lib", async () => {
    const { json } = await planJson(tsconfig({ dom: true }))
    expect(json.compilerOptions.lib).toEqual(["ES2023", "DOM", "DOM.Iterable"])
  })

  it("preserves custom lib + DOM additions together", async () => {
    const { json } = await planJson(tsconfig({ lib: ["ESNext"], dom: true }))
    expect(json.compilerOptions.lib).toEqual(["ESNext", "DOM", "DOM.Iterable"])
  })
})

describe("tsconfig() — jsx", () => {
  it("emits jsx field when set", async () => {
    const { json } = await planJson(tsconfig({ jsx: "react-jsx" }))
    expect(json.compilerOptions.jsx).toBe("react-jsx")
  })

  it("does not emit jsx field when null (default)", async () => {
    const { json } = await planJson(tsconfig({ jsx: null }))
    expect("jsx" in json.compilerOptions).toBe(false)
  })
})

describe("tsconfig() — module variants", () => {
  it("ESNext picks Bundler resolution", async () => {
    const { json } = await planJson(tsconfig({ module: "ESNext" }))
    expect(json.compilerOptions.module).toBe("ESNext")
    expect(json.compilerOptions.moduleResolution).toBe("Bundler")
  })

  it("CommonJS picks Node resolution", async () => {
    const { json } = await planJson(tsconfig({ module: "CommonJS" }))
    expect(json.compilerOptions.moduleResolution).toBe("Node")
  })

  it("Node16 picks Node16 resolution", async () => {
    const { json } = await planJson(tsconfig({ module: "Node16" }))
    expect(json.compilerOptions.moduleResolution).toBe("Node16")
  })
})

describe("tsconfig() — custom rootDir/outDir", () => {
  it("flows the paths into compilerOptions, include, and exclude", async () => {
    const { json } = await planJson(tsconfig({ rootDir: "./app", outDir: "./build" }))
    expect(json.compilerOptions.rootDir).toBe("./app")
    expect(json.compilerOptions.outDir).toBe("./build")
    expect(json.include).toEqual(["app/**/*"])
    expect(json.exclude).toEqual(["node_modules", "build"])
  })
})

describe("tsconfig() — references", () => {
  it("emits a references array in order with paths unchanged", async () => {
    const { json } = await planJson(tsconfig({ references: ["./packages/a", "./packages/b"] }))
    expect((json as { references?: unknown }).references).toEqual([
      { path: "./packages/a" },
      { path: "./packages/b" },
    ])
  })

  it("omits references when not set", async () => {
    const { json } = await planJson(tsconfig())
    expect("references" in json).toBe(false)
  })

  it("omits references when set to an empty array", async () => {
    const { json } = await planJson(tsconfig({ references: [] }))
    expect("references" in json).toBe(false)
  })

  it("leaves compilerOptions, include, and exclude unchanged", async () => {
    const without = await planJson(tsconfig())
    const withRefs = await planJson(tsconfig({ references: ["./packages/a"] }))
    expect(withRefs.json.compilerOptions).toEqual(without.json.compilerOptions)
    expect(withRefs.json.include).toEqual(without.json.include)
    expect(withRefs.json.exclude).toEqual(without.json.exclude)
  })
})

describe("tsconfig() — content shape", () => {
  it("emits valid JSON ending in a newline", async () => {
    const blueprint = tsconfig()
    const cs = await Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))))
    const op = cs.operations[0]
    if (op?._tag !== "Owned") {
      throw new Error("expected owned op")
    }
    expect(op.content.endsWith("\n")).toBe(true)
    const parsed: unknown = JSON.parse(op.content)
    expect(parsed).toBeTypeOf("object")
  })
})
