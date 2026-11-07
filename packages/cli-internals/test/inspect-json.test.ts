import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Schema } from "effect"
import { Ajv2020 } from "ajv/dist/2020.js"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjitectConfig } from "@projitect/core"
import { inspect, renderInspectJson } from "../src/commands/inspect.js"
import { inspectJsonSchemaDocument, InspectJsonSchemaUrl } from "../src/commands/inspect-json.js"

/**
 * `inspect-json.ts` is the versioned contract for `pjt inspect --json`. These tests guard both
 * halves of that contract:
 *
 *  - The committed schema file at `apps/website/public/schemas/inspect.v1.json` never drifts
 *    from the `InspectJson` Effect Schema it's generated from.
 *  - Real `--json` output — covering create, modify and ok files, a removal, and an upgrade in one
 *    pass — validates against that committed file using an independent validator (ajv), and
 *    malformed output is rejected by the same validator.
 */

const ROOT = path.join(os.tmpdir(), "projitect-test-inspect-json")
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/inspect-json.pjt.ts",
)
const SCHEMA_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/website/public/schemas/inspect.v1.json",
)

const decodeObject = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(`${ROOT}-`)
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

describe("inspect-json", () => {
  it("the committed schema file matches the generated document", async () => {
    await expect(`${JSON.stringify(inspectJsonSchemaDocument(), null, 2)}\n`).toMatchFileSnapshot(
      SCHEMA_FILE,
    )
  })

  it("real --json output validates against the committed schema; malformed output doesn't", async () => {
    // `.gitignore` is left missing → create. `.dockerignore` holds drifted region content →
    // modify. `.npmignore` holds the exact region content → ok.
    // Lockfile entry for the first blueprint at an older version → upgrade.
    // Lockfile entry for a blueprint no longer in the tree → removal.
    await fs.writeFile(
      path.join(cwd, ".dockerignore"),
      "# pjt:test:inspect-json-modify start\nsomething-else/\n# pjt:test:inspect-json-modify end\n",
      "utf8",
    )
    await fs.writeFile(
      path.join(cwd, ".npmignore"),
      "# pjt:test:inspect-json-ok start\ncoverage/\n# pjt:test:inspect-json-ok end\n",
      "utf8",
    )
    await fs.writeFile(
      path.join(cwd, ".pjt.lock"),
      JSON.stringify({
        version: 1,
        blueprints: {
          "pjt:test:inspect-json": {
            version: "0.0.1",
            operations: [
              {
                _tag: "Region",
                path: ".gitignore",
                ownerId: "pjt:test:inspect-json",
                commentPrefix: "#",
              },
            ],
          },
          "pjt:test:gone": {
            version: "1.0.0",
            operations: [
              {
                _tag: "Owned",
                path: "generated.ts",
                ownerId: "pjt:test:gone",
              },
            ],
          },
        },
      }),
      "utf8",
    )

    const config = ProjitectConfig.resolve({ projectRoot: cwd, blueprintFile: FIXTURE })
    const result = await Effect.runPromise(inspect({ config }))

    expect(new Set(result.files.map((file) => file.status))).toEqual(
      new Set(["create", "modify", "ok"]),
    )
    expect(result.removals.length).toBeGreaterThan(0)
    expect(result.upgrades.length).toBeGreaterThan(0)
    expect(result.hasDrift).toBe(true)

    const output = decodeObject(JSON.parse(renderInspectJson(result)))
    const validate = new Ajv2020({ strict: false }).compile(
      decodeObject(JSON.parse(await fs.readFile(SCHEMA_FILE, "utf8"))),
    )

    expect(validate(output)).toBe(true)
    expect(output["$schema"]).toBe(InspectJsonSchemaUrl)

    // An unknown file status fails validation.
    const badStatus = { ...output, files: [{ path: "x", status: "bogus", summary: "x" }] }
    expect(validate(badStatus)).toBe(false)

    // A missing `hasDrift` fails validation.
    const { hasDrift: _hasDrift, ...withoutHasDrift } = output
    expect(validate(withoutHasDrift)).toBe(false)

    // An unknown additional top-level key still validates — the forward-compatibility promise.
    expect(validate({ ...output, extra: "field" })).toBe(true)
  })
})
