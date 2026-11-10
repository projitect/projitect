import { describe, expect, it } from "vitest"
import { Effect, Schema } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import manifest from "../package.json" with { type: "json" }
import { next } from "../src/index.js"

/**
 * Unit tests for `@projitect/blueprint-next` — the composite that scaffolds a Next.js App Router
 * + TypeScript app. The plan runs against the in-memory `BlueprintFileSystem` from
 * `@projitect/test-kit`; the assertions check the emitted operations, which is the contract the
 * planner / applier relies on. The full build → inspect → remodel → remove lifecycle is covered in
 * `packages/cli-internals/test/next-lifecycle.test.ts`.
 */

const runPlan = () => Effect.runPromise(next().plan.pipe(Effect.provide(makeInMemoryLayer({}))))

const STARTER_PATHS = [
  "eslint.config.mjs",
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/app/page.test.tsx",
  "src/app/page.tsx",
]

const Tsconfig = Schema.Struct({
  compilerOptions: Schema.Record(Schema.String, Schema.Unknown),
  include: Schema.Array(Schema.String),
})

describe("next()", () => {
  it("has one composite id", () => {
    expect(next().id).toBe("pjt:next")
  })

  it("takes its version from the package manifest, so a release bump reaches the lockfile", () => {
    expect(next().version).toBe(manifest.version)
  })

  it("seeds exactly the starter source and the ESLint config", async () => {
    const { operations } = await runPlan()
    const seeds = operations.filter((o) => o._tag === "Seed")
    expect(seeds.map((o) => o.path).toSorted()).toEqual(STARTER_PATHS)
  })

  it("owns tsconfig.json, vitest.config.ts and next.config.ts", async () => {
    const { operations } = await runPlan()
    const owned = operations.filter((o) => o._tag === "Owned")
    expect(owned.map((o) => o.path).toSorted()).toEqual([
      "next.config.ts",
      "tsconfig.json",
      "vitest.config.ts",
    ])
  })

  it("renders a tsconfig that already holds every key `next build` would add", async () => {
    const { operations } = await runPlan()
    const owned = operations.find((o) => o._tag === "Owned" && o.path === "tsconfig.json")
    if (owned?._tag !== "Owned") {
      throw new Error("expected owned tsconfig op")
    }
    const tsconfig = Schema.decodeUnknownSync(Tsconfig)(JSON.parse(owned.content))
    expect(tsconfig.compilerOptions).toMatchObject({
      jsx: "react-jsx",
      moduleResolution: "Bundler",
      noEmit: true,
      allowJs: true,
      incremental: true,
      plugins: [{ name: "next" }],
    })
    expect(tsconfig.compilerOptions["lib"]).toContain("DOM")
    expect(tsconfig.include).toEqual(
      expect.arrayContaining(["next-env.d.ts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"]),
    )
  })

  it("keeps the test block in vitest.config.ts and puts the framework in next.config.ts", async () => {
    const { operations } = await runPlan()
    const content = (path: string) => {
      const owned = operations.find((o) => o._tag === "Owned" && o.path === path)
      if (owned?._tag !== "Owned") {
        throw new Error(`expected owned op for ${path}`)
      }
      return owned.content
    }
    expect(content("next.config.ts")).toContain("NextConfig")
    expect(content("vitest.config.ts")).toContain('environment: "jsdom"')
  })

  it("merges the Next.js scripts and dependencies into package.json without a key collision", async () => {
    const { operations } = await runPlan()
    const merges = operations.filter((o) => o._tag === "Merge")
    expect(merges.every((o) => o.path === "package.json")).toBe(true)
    const keys = merges.flatMap((o) => [...o.ownedKeys])
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(
      expect.arrayContaining([
        "scripts.dev",
        "scripts.build",
        "scripts.start",
        "scripts.lint",
        "scripts.test",
        "dependencies.next",
        "dependencies.react",
        "dependencies.react-dom",
        "devDependencies.eslint-config-next",
        "devDependencies.vitest",
      ]),
    )
  })

  it("declares the supported Next.js and React ranges in the manifest, matching the scaffold", async () => {
    const { operations } = await runPlan()
    const dependencies = operations
      .filter((o) => o._tag === "Merge")
      .map((o) => o.value)
      .flatMap((value) => {
        const decoded = Schema.decodeUnknownSync(
          Schema.Struct({
            dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
          }),
        )(value)
        return decoded.dependencies === undefined ? [] : [decoded.dependencies]
      })
    expect(dependencies).toContainEqual(
      expect.objectContaining({
        next: manifest.projitect.supports.next,
        react: manifest.projitect.supports.react,
      }),
    )
    expect(manifest.engines.node).toBe(">=22.12.0")
  })

  it("claims the node, next and tsbuildinfo .gitignore sections", async () => {
    const { operations } = await runPlan()
    const regions = operations.filter((o) => o._tag === "Region")
    expect(regions.map((o) => o.ownerId).toSorted()).toEqual([
      "pjt:gitignore:next",
      "pjt:gitignore:node",
      "pjt:gitignore:tsbuildinfo",
      "pjt:vitest",
    ])
    expect(regions.find((o) => o.ownerId === "pjt:gitignore:next")?.content).toContain(".next/")
  })

  it("declares a permission for every path it writes", async () => {
    const blueprint = next()
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
