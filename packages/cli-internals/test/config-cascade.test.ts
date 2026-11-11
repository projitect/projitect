import { describe, expect, it } from "vitest"
import { ProjitectConfig } from "@projitect/core"
import { parseEnv, resolveConfig } from "../src/config-cascade.js"

/**
 * The config cascade (`defaults → env → .pjt.ts → CLI args`, later wins) is expressed as a single
 * right-biased `Reducer` with `{}` as the identity. These tests pin that algebra: defaults applied,
 * later layers win, and an empty/absent layer folds as a no-op.
 */
describe("ProjitectConfig.resolve — the cascade reducer", () => {
  it("returns the defaults when there are no overrides", () => {
    const config = ProjitectConfig.resolve()
    expect(config.projectRoot).toBe("/")
    expect(config.blueprintFile).toBe(".pjt.ts")
    expect(config.requireCleanGit).toBe(true)
    expect(config.verbosity).toBe(1)
  })

  it("applies a partial override, leaving other keys at their default", () => {
    const config = ProjitectConfig.resolve({ verbosity: 3 })
    expect(config.verbosity).toBe(3)
    expect(config.blueprintFile).toBe(".pjt.ts")
  })

  it("lets later layers win on overlapping keys", () => {
    const config = ProjitectConfig.resolve({ verbosity: 2, jsonOutput: true }, { verbosity: 3 })
    expect(config.verbosity).toBe(3)
    expect(config.jsonOutput).toBe(true)
  })

  it("treats the empty layer as the identity (a no-op)", () => {
    expect(ProjitectConfig.resolve({ verbosity: 2 }, {})).toEqual(
      ProjitectConfig.resolve({ verbosity: 2 }),
    )
  })
})

describe("resolveConfig — absent layers fold as no-ops", () => {
  it("merges only the layers that are present", () => {
    const config = resolveConfig({ cliArgs: { verbosity: 3 } })
    expect(config.verbosity).toBe(3)
    expect(config.requireCleanGit).toBe(true)
  })

  it("lets later layers (cliArgs) win over earlier ones (env)", () => {
    const config = resolveConfig({ env: { verbosity: 1 }, cliArgs: { verbosity: 3 } })
    expect(config.verbosity).toBe(3)
  })
})

describe("parseEnv", () => {
  it("parses known PJT_* vars and drops absent ones", () => {
    expect(
      parseEnv({
        PJT_BLUEPRINT_FILE: "custom.ts",
        PJT_VERBOSITY: "2",
        PJT_JSON_OUTPUT: "true",
      }),
    ).toEqual({ blueprintFile: "custom.ts", verbosity: 2, jsonOutput: true })
  })

  it("ignores unknown vars and unparseable values", () => {
    expect(parseEnv({ UNKNOWN: "x", PJT_VERBOSITY: "not-a-number" })).toEqual({})
  })

  it("accepts 0/1/true/false for booleans", () => {
    expect(parseEnv({ PJT_REQUIRE_CLEAN_GIT: "0" })).toEqual({ requireCleanGit: false })
    expect(parseEnv({ PJT_REQUIRE_CLEAN_GIT: "1" })).toEqual({ requireCleanGit: true })
  })
})
