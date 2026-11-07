import { describe, expect, it } from "vitest"
import { gitignores } from "../src/index.js"
import manifest from "../package.json" with { type: "json" }

/**
 * Unit tests for `@projitect/blueprint-gitignore`. Every section is a region blueprint whose
 * version must follow the installed package manifest, so a release bump reaches `.pjt.lock`.
 */

describe("gitignores — version", () => {
  it.each(Object.entries(gitignores))(
    "%s reports the installed package manifest version",
    (_, section) => {
      expect(section().version).toBe(manifest.version)
    },
  )
})
