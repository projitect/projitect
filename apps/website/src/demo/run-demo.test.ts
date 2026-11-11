import { describe, expect, it } from "vitest"
import starter from "../../examples/browser-demo/example.ts?raw"
import { runDemo } from "./run-demo"

const withBlueprints = (list: string): string =>
  `import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { vitest } from "@projitect/blueprint-vitest"
export default pjt({ blueprints: [${list}] })`

const paths = (result: Awaited<ReturnType<typeof runDemo>>): readonly string[] =>
  result.ok ? result.plan.map((entry) => entry.path) : []

describe("runDemo", () => {
  it("plans and diffs the starter", async () => {
    const result = await runDemo(starter)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.length).toBeGreaterThan(0)
      expect(result.drift).not.toBe("")
      expect(result.hasDrift).toBe(true)
    }
  })

  it("changes the plan when blueprints are added or removed", async () => {
    const small = await runDemo(withBlueprints("gitignores.node()"))
    const large = await runDemo(withBlueprints("gitignores.node(), vitest()"))
    expect(paths(small)).toEqual([".gitignore"])
    expect(paths(large)).toContain("vitest.config.ts")
    expect(paths(large).length).toBeGreaterThan(paths(small).length)
  })

  it("reports a syntax error without throwing", async () => {
    const result = await runDemo("export default pjt({ blueprints: [")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toBe("")
    }
  })

  it("reports an unknown import without throwing", async () => {
    const result = await runDemo(
      'import { nope } from "@projitect/blueprint-nope"\nexport default nope',
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.message).toContain("@projitect/blueprint-nope")
    }
  })

  it("reports a wrong default export", async () => {
    const result = await runDemo("export default 42")
    expect(result).toMatchObject({ ok: false })
  })

  it("reports an unknown blueprint name as a readable error", async () => {
    const result = await runDemo(withBlueprints("gitignores.nope()"))
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.message).not.toBe("")
    }
  })
})
