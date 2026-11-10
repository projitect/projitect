import { Effect, Result } from "effect"
import { describe, expect, it } from "vitest"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { blueprintTree, evaluatePjt } from "../src/browser.js"
import { firstPartyRegistry } from "../src/browser-blueprints.js"
import type { PjtEvalFailure } from "../src/browser.js"

const failureOf = (source: string): PjtEvalFailure => {
  const result = evaluatePjt(source, firstPartyRegistry)
  if (Result.isSuccess(result)) {
    throw new Error("expected a failure")
  }
  return result.failure
}

describe("evaluatePjt", () => {
  it("returns the blueprint list of a valid, typed .pjt.ts", async () => {
    const result = evaluatePjt(
      `import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"

export default pjt({
  blueprints: [gitignores.macOs(), gitignores.node()],
})
`,
      firstPartyRegistry,
    )
    if (Result.isFailure(result)) {
      throw new Error(result.failure.message)
    }
    const tree = await Effect.runPromise(
      Effect.provide(blueprintTree(result.success), makeInMemoryLayer()),
    )
    expect(tree.map((blueprint) => ("id" in blueprint ? blueprint.id : blueprint.name))).toEqual([
      "pjt:gitignore:macos",
      "pjt:gitignore:node",
    ])
  })

  it("returns a typed failure with the line for a syntax error, without throwing", () => {
    const failure = failureOf(
      'import { pjt } from "@projitect/cli"\nexport default pjt({ blueprints: [ )\n',
    )
    expect(failure._tag).toBe("Syntax")
    expect(failure).toMatchObject({ line: 2 })
    expect(failure.message).not.toBe("")
  })

  it("returns a typed failure for an import the registry lacks", () => {
    const failure = failureOf('import { nope } from "left-pad"\nexport default nope\n')
    expect(failure).toMatchObject({ _tag: "UnknownImport", specifier: "left-pad" })
    expect(failure.message).toContain("left-pad")
  })

  it("returns a typed failure when the top level throws", () => {
    expect(failureOf('throw new Error("boom")\n')).toMatchObject({
      _tag: "Runtime",
      message: "boom",
    })
  })

  it.each([
    ["the config tag", 'export default { get _tag() { throw new Error("getter failed") } }'],
    [
      "the blueprint list",
      'export default { _tag: "ProjitectConfig", get blueprints() { throw new Error("getter failed") } }',
    ],
    [
      "a nested directory",
      'export default { _tag: "ProjitectConfig", blueprints: [{ _tag: "Directory", name: "web", get children() { throw new Error("getter failed") } }] }',
    ],
  ])("returns a runtime failure when reading %s throws", (_name, source) => {
    expect(failureOf(source)).toMatchObject({ _tag: "Runtime", message: "getter failed" })
  })

  it("handles thrown values whose string conversion also throws", () => {
    expect(failureOf("throw Object.create(null)")).toMatchObject({
      _tag: "Runtime",
      message: "Evaluation failed with an unreadable thrown value",
    })
  })

  it("rejects cyclic directory trees without overflowing the stack", () => {
    expect(
      failureOf(`const node = { _tag: "Directory", name: "web", children: [] }
node.children.push(node)
export default { _tag: "ProjitectConfig", blueprints: [node] }`),
    ).toMatchObject({ _tag: "InvalidDefaultExport" })
  })

  it("returns a typed failure when the default export is not pjt({...})", () => {
    expect(failureOf("export default [1, 2]\n")).toMatchObject({
      _tag: "InvalidDefaultExport",
      received: "Array",
    })
  })

  it.each([
    ["no blueprints", 'export default { _tag: "ProjitectConfig" }\n'],
    ["a non-array blueprints", 'export default { _tag: "ProjitectConfig", blueprints: 3 }\n'],
    ["a sparse blueprint list", 'export default { _tag: "ProjitectConfig", blueprints: [,] }\n'],
    [
      "a non-blueprint element",
      'export default { _tag: "ProjitectConfig", blueprints: [{ id: 1 }] }\n',
    ],
    [
      "a directory holding a non-blueprint",
      'export default { _tag: "ProjitectConfig", blueprints: [{ _tag: "Directory", name: "a", children: [42] }] }\n',
    ],
    [
      "a non-object config",
      'export default { _tag: "ProjitectConfig", blueprints: [], config: 1 }\n',
    ],
  ])("rejects a tagged object with %s", (_name, source) => {
    expect(failureOf(source)._tag).toBe("InvalidDefaultExport")
  })

  it("keeps directory nodes and the Effect form", async () => {
    const result = evaluatePjt(
      `import { pjt, directory } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { Effect } from "effect"

export const a = pjt({ blueprints: [directory("web", [gitignores.node()])] })
export default pjt({ blueprints: Effect.succeed([directory("web", [gitignores.node()])]), config: {} })
`,
      firstPartyRegistry,
    )
    if (Result.isFailure(result)) {
      throw new Error(result.failure.message)
    }
    const tree = await Effect.runPromise(
      Effect.provide(blueprintTree(result.success), makeInMemoryLayer()),
    )
    expect(tree).toMatchObject([{ _tag: "Directory", name: "web" }])
  })

  it("uses the CLI structural guard for blueprint permissions", () => {
    expect(
      failureOf(`import { Effect } from "effect"
export default { _tag: "ProjitectConfig", blueprints: [{
  id: "invalid", version: "1", permissions: [{ kind: "write", glob: 42 }],
  plan: Effect.succeed({ operations: [] })
}] }`),
    ).toMatchObject({ _tag: "InvalidDefaultExport" })
  })
})
