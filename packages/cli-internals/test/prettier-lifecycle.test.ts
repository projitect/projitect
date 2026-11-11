import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { prettier } from "@projitect/blueprint-prettier"
import type { PrettierConfigOptions } from "@projitect/blueprint-prettier"
import { applyPlan } from "../src/applier.js"
import { diffPlan } from "../src/differ.js"
import { makeProjectRootLayer, makeRealLayer } from "../src/filesystem-impl.js"
import { buildPlan } from "../src/plan.js"

const requireFromBlueprint = createRequire(import.meta.resolve("@projitect/blueprint-prettier"))
const formatter = requireFromBlueprint.resolve("prettier/bin/prettier.cjs")
const PackageJson = Schema.Record(Schema.String, Schema.Unknown)

const formattingCases: readonly PrettierConfigOptions[] = [
  {},
  { tabWidth: 4 },
  { tabWidth: 1, printWidth: 12 },
  { semi: false, singleQuote: true, printWidth: 10, tabWidth: 4, trailingComma: "none" },
  { proseWrap: "always", printWidth: 20 },
]

describe("Prettier configuration lifecycle on the real filesystem", () => {
  it.each(formattingCases)("stays clean after real Prettier with %j", async (options) => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "pjt-prettier-lifecycle-"))
    const layer = makeProjectRootLayer(cwd)
    const configPath = path.join(cwd, ".prettierrc.json")
    const packagePath = path.join(cwd, "package.json")
    try {
      await fs.writeFile(
        packagePath,
        JSON.stringify({
          private: true,
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^4.0.0" },
          notes: { owner: "user" },
        }),
      )
      const { plan } = await Effect.runPromise(
        buildPlan({ tree: [prettier.config(options)], projectRoot: cwd, layerFor: makeRealLayer }),
      )
      const apply = () => Effect.runPromise(Effect.provide(applyPlan({ plan }), layer))
      const inspect = () => Effect.runPromise(Effect.provide(diffPlan({ plan }), layer))
      const format = () => execFileSync(process.execPath, [formatter, "--write", "."], { cwd })

      await apply()
      const expected = await fs.readFile(configPath, "utf8")
      format()
      expect(await fs.readFile(configPath, "utf8")).toBe(expected)
      const formatted = await inspect()
      expect(formatted.hasDrift).toBe(false)
      expect(
        Schema.decodeUnknownSync(PackageJson)(JSON.parse(await fs.readFile(packagePath, "utf8"))),
      ).toMatchObject({
        scripts: { test: "vitest run", format: "prettier --write ." },
        devDependencies: { vitest: "^4.0.0" },
        notes: { owner: "user" },
      })

      await fs.writeFile(configPath, '{"semi":true,"tabWidth":8}\n')
      const edited = await inspect()
      expect(edited.hasDrift).toBe(true)
      await apply()
      expect(await fs.readFile(configPath, "utf8")).toBe(expected)
      format()
      const repaired = await inspect()
      expect(repaired.hasDrift).toBe(false)
      const before = await fs.readFile(packagePath, "utf8")
      await apply()
      format()
      expect(await fs.readFile(configPath, "utf8")).toBe(expected)
      expect(await fs.readFile(packagePath, "utf8")).toBe(before)
    } finally {
      await fs.rm(cwd, { recursive: true, force: true })
    }
  })
})
