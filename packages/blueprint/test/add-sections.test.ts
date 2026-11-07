import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { computeSplice, resolveSections } from "../src/add-sections.js"
import type { ProjitectPackageMetadata } from "../src/add-sections.js"

const SET: ProjitectPackageMetadata = {
  type: "blueprint-set",
  import: 'import { gitignores } from "@projitect/blueprint-gitignore"',
  callTemplate: "gitignores.{section}()",
  sections: ["macOs", "node", "linux"],
}

const SINGLE: ProjitectPackageMetadata = {
  type: "blueprint",
  import: 'import { tsconfig } from "x"',
  call: "tsconfig()",
}

describe("resolveSections", () => {
  it("All → empty request (meaning every section)", async () => {
    const out = await Effect.runPromise(
      resolveSections({ metadata: SET, strategy: { _tag: "All" } }),
    )
    expect(out).toEqual([])
  })

  it("Explicit → the supplied sections", async () => {
    const out = await Effect.runPromise(
      resolveSections({ metadata: SET, strategy: { _tag: "Explicit", sections: ["node"] } }),
    )
    expect(out).toEqual(["node"])
  })

  it("Ask → defers to choose with the metadata", async () => {
    const out = await Effect.runPromise(
      resolveSections({
        metadata: SET,
        strategy: { _tag: "Ask", choose: (m) => Effect.succeed(m.sections?.slice(0, 2) ?? []) },
      }),
    )
    expect(out).toEqual(["macOs", "node"])
  })

  it("ignores the strategy for type: blueprint", async () => {
    const out = await Effect.runPromise(
      resolveSections({ metadata: SINGLE, strategy: { _tag: "Explicit", sections: ["a"] } }),
    )
    expect(out).toEqual([])
  })
})

describe("computeSplice", () => {
  it("blueprint-set with no requested sections adds all, using callTemplate", () => {
    const out = computeSplice({ metadata: SET, requestedSections: [] })
    expect(out.importLine).toBe(SET.import)
    expect(out.sectionsAdded).toEqual(["macOs", "node", "linux"])
    expect(out.callLines).toEqual([
      "gitignores.macOs(),",
      "gitignores.node(),",
      "gitignores.linux(),",
    ])
  })

  it("blueprint-set filters out unknown explicit sections", () => {
    const out = computeSplice({ metadata: SET, requestedSections: ["node", "bogus"] })
    expect(out.sectionsAdded).toEqual(["node"])
    expect(out.callLines).toEqual(["gitignores.node(),"])
  })

  it("blueprint-set defaults the template to {section}()", () => {
    const out = computeSplice({
      metadata: { type: "blueprint-set", import: "i", sections: ["a"] },
      requestedSections: [],
    })
    expect(out.callLines).toEqual(["a(),"])
  })

  it("blueprint emits a single call line", () => {
    const out = computeSplice({ metadata: SINGLE, requestedSections: [] })
    expect(out.callLines).toEqual(["tsconfig(),"])
    expect(out.sectionsAdded).toEqual([])
  })

  it("blueprint without a call emits a TODO placeholder", () => {
    const out = computeSplice({
      metadata: { type: "blueprint", import: "i" },
      requestedSections: [],
    })
    expect(out.callLines[0]).toContain("TODO")
  })
})
