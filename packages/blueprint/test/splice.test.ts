import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { spliceBlueprintFile } from "../src/splice.js"

/**
 * `spliceBlueprintFile` powers `pjt add` — it splices a new import line and one or more blueprint
 * call lines into `.pjt.ts` text using the convention markers (`// pjt:imports start/end` and
 * `// pjt:blueprints start/end`). A regression here either corrupts the user's file or fails
 * silently and prints "Added." while doing nothing.
 *
 * Coverage:
 *  - new import + new calls splice between the markers, indented to match the seeded template
 *  - duplicate import is deduped (idempotent re-add of the same package)
 *  - empty call array doesn't touch the blueprints block (used when --section is omitted)
 *  - missing imports markers → pjt.add.markers-missing
 *  - missing blueprints markers → pjt.add.markers-missing
 *  - inverted markers (end before start) treated as missing
 */

const SEEDED_TEMPLATE = [
  "// pjt:imports start",
  "// pjt:imports end",
  "",
  "export default pjt({",
  "  blueprints: [",
  "    // pjt:blueprints start",
  "    // pjt:blueprints end",
  "  ],",
  "})",
  "",
].join("\n")

const run = (content: string, importLine: string, callLines: readonly string[]): Promise<string> =>
  Effect.runPromise(
    spliceBlueprintFile({ content, blueprintFile: ".pjt.ts", importLine, callLines }),
  )

const runError = (content: string, importLine: string, callLines: readonly string[]) =>
  Effect.runPromise(
    Effect.flip(spliceBlueprintFile({ content, blueprintFile: ".pjt.ts", importLine, callLines })),
  )

describe("spliceBlueprintFile — happy paths", () => {
  it("adds a new import and call line to a seeded template", async () => {
    const after = await run(
      SEEDED_TEMPLATE,
      'import { gitignores } from "@projitect/blueprint-gitignore"',
      ["gitignores.macOs()"],
    )

    expect(after).toContain(
      '// pjt:imports start\nimport { gitignores } from "@projitect/blueprint-gitignore"\n// pjt:imports end',
    )
    expect(after).toContain(
      "// pjt:blueprints start\n    gitignores.macOs()\n    // pjt:blueprints end",
    )
  })

  it("dedupes a repeated import — splicing twice with the same import keeps one copy", async () => {
    const first = await run(SEEDED_TEMPLATE, 'import { x } from "y"', ["x()"])
    const after = await run(first, 'import { x } from "y"', [])

    const importCount = (after.match(/import \{ x \} from "y"/gu) ?? []).length
    expect(importCount).toBe(1)
  })

  it("indents each call line to 4 spaces, matching the seeded template", async () => {
    const after = await run(SEEDED_TEMPLATE, 'import { a, b } from "x"', ["a()", "b()"])

    expect(after).toContain("    a()\n    b()\n    // pjt:blueprints end")
  })

  it("does not touch the blueprints block when callLines is empty", async () => {
    const after = await run(SEEDED_TEMPLATE, 'import "side-effect"', [])

    // Import got added
    expect(after).toContain('import "side-effect"')
    // But the blueprints block is still empty
    expect(after).toContain("// pjt:blueprints start\n    // pjt:blueprints end")
  })

  it("accepts call lines with leading whitespace and re-indents them to 4 spaces", async () => {
    const after = await run(SEEDED_TEMPLATE, 'import { x } from "y"', ["        x()"]) // 8 leading spaces, will be stripped + re-indented to 4

    expect(after).toContain("    x()\n")
    expect(after).not.toContain("        x()\n")
  })
})

describe("spliceBlueprintFile — error paths", () => {
  it("fails with pjt.add.markers-missing when imports markers are absent", async () => {
    const err = await runError(
      [
        "export default pjt({",
        "  blueprints: [",
        "    // pjt:blueprints start",
        "    // pjt:blueprints end",
        "  ],",
        "})",
        "",
      ].join("\n"),
      'import "x"',
      ["x()"],
    )
    expect(err._tag).toBe("AddMarkersMissing")
    expect(err.id).toBe("pjt.add.markers-missing")
    expect(err.missingMarker).toContain("pjt:imports")
  })

  it("fails with pjt.add.markers-missing when blueprints markers are absent", async () => {
    const err = await runError(
      [
        "// pjt:imports start",
        "// pjt:imports end",
        "",
        "export default pjt({ blueprints: [] })",
        "",
      ].join("\n"),
      'import "x"',
      ["x()"],
    )
    expect(err._tag).toBe("AddMarkersMissing")
    expect(err.missingMarker).toContain("pjt:blueprints")
  })

  it("treats inverted marker order (end before start) as missing", async () => {
    const err = await runError(
      [
        "// pjt:imports end", // Intentionally inverted
        "// pjt:imports start",
        "",
        "export default pjt({",
        "  blueprints: [",
        "    // pjt:blueprints start",
        "    // pjt:blueprints end",
        "  ],",
        "})",
        "",
      ].join("\n"),
      'import "x"',
      [],
    )
    expect(err._tag).toBe("AddMarkersMissing")
  })
})
