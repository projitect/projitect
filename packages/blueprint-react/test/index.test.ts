import { describe, expect, expectTypeOf, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import type { Blueprint } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }
import { react } from "../src/index.js"
import type { ReactOptions, ReactTemplate } from "../src/index.js"

/**
 * Unit tests for `@projitect/blueprint-react` — the composite that scaffolds a React + Vite +
 * TypeScript app. The plan runs against the in-memory `BlueprintFileSystem` from
 * `@projitect/test-kit`; the assertions check the emitted operations, which is the contract the
 * planner / applier relies on. The full build → inspect → remodel → remove lifecycle is covered in
 * `packages/cli-internals/test/react-lifecycle.test.ts`.
 */

const planOf = (blueprint: Blueprint.Blueprint) =>
  Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({}))))

const runPlan = () => planOf(react())

const failureOf = async (options: ReactOptions) => {
  const exit = await Effect.runPromiseExit(
    react(options).plan.pipe(Effect.provide(makeInMemoryLayer({}))),
  )
  if (exit._tag !== "Failure") {
    throw new Error("expected the plan to fail")
  }
  return JSON.stringify(exit.cause)
}

const mergeKeys = (operations: readonly { readonly _tag: string }[]) =>
  operations.flatMap((o) =>
    o._tag === "Merge" && "ownedKeys" in o ? [...(o.ownedKeys as readonly string[])] : [],
  )

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

describe("react() options", () => {
  it("plans the same changes for react() and react({ template: 'react-ts' })", async () => {
    expect(await planOf(react({ template: "react-ts" }))).toEqual(await runPlan())
  })

  it("plans a JavaScript app for template 'react'", async () => {
    const { operations } = await planOf(react({ template: "react" }))
    const paths = (tag: string) =>
      operations
        .filter((o) => o._tag === tag && "path" in o)
        .map((o) => (o as { path: string }).path)
    expect(paths("Seed").toSorted()).toEqual([
      "index.html",
      "src/App.jsx",
      "src/App.test.jsx",
      "src/index.css",
      "src/main.jsx",
    ])
    expect(paths("Owned").toSorted()).toEqual(["vite.config.js", "vitest.config.ts"])
    const keys = mergeKeys(operations)
    expect(keys.some((key) => key.includes("typescript") || key.includes("@types/"))).toBe(false)
    expect(keys).toEqual(
      expect.arrayContaining([
        "devDependencies.jsdom",
        "devDependencies.@testing-library/react",
        "devDependencies.@testing-library/dom",
      ]),
    )
    const pkg = operations.find(
      (o) => o._tag === "Merge" && "ownedKeys" in o && o.ownedKeys.includes("scripts.build"),
    )
    expect(JSON.stringify(pkg)).toContain('"build":"vite build"')
    const html = operations.find((o) => o._tag === "Seed" && o.path === "index.html")
    expect(JSON.stringify(html)).toContain("/src/main.jsx")
    const vitestConfig = operations.find((o) => o._tag === "Owned" && o.path === "vitest.config.ts")
    expect(JSON.stringify(vitestConfig)).toContain("jsdom")
  })

  it("seeds a JavaScript App test that targets the seeded App", async () => {
    const { operations } = await planOf(react({ template: "react" }))
    const seed = (path: string) => {
      const op = operations.find((o) => o._tag === "Seed" && o.path === path)
      if (op?._tag !== "Seed") {
        throw new Error(`expected seed ${path}`)
      }
      return op.content
    }
    expect(seed("src/App.test.jsx")).toContain('import App from "./App"')
    expect(seed("src/App.jsx")).toContain("Hello from projitect")
    expect(seed("src/App.test.jsx")).toContain("Hello from projitect")
    expect(seed("src/App.jsx")).not.toMatch(/: (?:string|number)|<[A-Z]\w*>\(/u)
  })

  it("sets the package name only when given", async () => {
    const { operations: defaults } = await runPlan()
    expect(mergeKeys(defaults)).not.toContain("name")
    const { operations } = await planOf(react({ name: "my-app" }))
    expect(mergeKeys(operations)).toContain("name")
    expect(JSON.stringify(operations)).toContain('"name":"my-app"')
  })

  it("accepts a scoped package name", async () => {
    const { operations } = await planOf(react({ name: "@acme/app" }))
    expect(mergeKeys(operations)).toContain("name")
  })

  it.each([
    ["an unknown template", { template: "vue" }, "template"],
    ["a non-string template", { template: 3 }, "template"],
    ["an empty name", { name: "" }, "name"],
    ["a blank name", { name: "  " }, "name"],
    ["an uppercase name", { name: "MyApp" }, "name"],
    ["a name with spaces", { name: "my app" }, "name"],
    ["a name with a path separator", { name: "a/b" }, "name"],
    ["a name with a parent segment", { name: "../app" }, "name"],
    ["a name with a leading dot", { name: ".app" }, "name"],
    ["a name with a leading underscore", { name: "_app" }, "name"],
    ["an over-long name", { name: "a".repeat(215) }, "name"],
    ["a non-string name", { name: 42 }, "name"],
  ])("rejects %s with pjt.react.invalid-options", async (_label, options, field) => {
    const failure = await failureOf(options as ReactOptions)
    expect(failure).toContain("pjt.react.invalid-options")
    expect(failure).toContain(`"field":"${field}"`)
  })

  it("types the options as one template union and a name", () => {
    expectTypeOf<ReactTemplate>().toEqualTypeOf<"react-ts" | "react">()
    expectTypeOf<ReactOptions>().toEqualTypeOf<{
      readonly template?: ReactTemplate
      readonly name?: string
    }>()
    // @ts-expect-error -- unknown template
    const unknownTemplate: ReactOptions = { template: "vue" }
    // @ts-expect-error -- no separate typescript switch
    const typescriptSwitch: ReactOptions = { typescript: true }
    expect([unknownTemplate, typescriptSwitch]).toHaveLength(2)
  })
})
