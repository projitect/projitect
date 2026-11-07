import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { splice } from "../src/edit-pjt.js"

/**
 * `edit-pjt.ts` is the thin file read/write around the shared `spliceBlueprintFile` (whose
 * behavior is covered in `@projitect/blueprint`). These tests cover the disk round-trip and the
 * read-failure mapping.
 */

const ROOT = path.join(os.tmpdir(), "projitect-test-edit-pjt")

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(`${ROOT}-`)
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

const TEMPLATE = [
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

describe("splice — file round-trip", () => {
  it("reads .pjt.ts, splices, and writes the result back", async () => {
    await fs.writeFile(path.join(cwd, ".pjt.ts"), TEMPLATE, "utf8")

    await Effect.runPromise(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import { x } from "y"',
        callLines: ["x()"],
      }),
    )

    const after = await fs.readFile(path.join(cwd, ".pjt.ts"), "utf8")
    expect(after).toContain('// pjt:imports start\nimport { x } from "y"\n// pjt:imports end')
    expect(after).toContain("// pjt:blueprints start\n    x()\n    // pjt:blueprints end")
  })

  it("fails with pjt.fs.read-failed when the blueprint file doesn't exist", async () => {
    const err = await Effect.runPromise(
      Effect.flip(
        splice({
          projectRoot: cwd,
          blueprintFile: ".pjt.ts",
          importLine: 'import "x"',
          callLines: ["x()"],
        }),
      ),
    )
    expect(err._tag).toBe("FsReadFailed")
  })
})
