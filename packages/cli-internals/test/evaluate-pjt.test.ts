import { Effect, Result } from "effect"
import { describe, expect, it } from "vitest"
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
      `import { pjt } from "projitect/cli"
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
    const tree = await Effect.runPromise(blueprintTree(result.success))
    expect(tree.map((blueprint) => ("id" in blueprint ? blueprint.id : blueprint.name))).toEqual([
      "pjt:gitignore:macos",
      "pjt:gitignore:node",
    ])
  })

  it("returns a typed failure with the line for a syntax error, without throwing", () => {
    const failure = failureOf(
      'import { pjt } from "projitect/cli"\nexport default pjt({ blueprints: [ )\n',
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

  it("returns a typed failure when the default export is not pjt({...})", () => {
    expect(failureOf("export default [1, 2]\n")).toMatchObject({
      _tag: "InvalidDefaultExport",
      received: "Array",
    })
  })
})
