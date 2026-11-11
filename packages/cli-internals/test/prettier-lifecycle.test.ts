import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { prettier } from "@projitect/blueprint-prettier"
import { BlueprintFileSystem } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { applyPlan } from "../src/applier.js"
import { makeGatedLayer } from "../src/gated-layer.js"
import { buildPlan } from "../src/plan.js"

/**
 * `prettier.config()` through the real engine steps `pjt remodel` runs — plan, then apply — against
 * an in-memory project, reading the resulting files back.
 */

const remodel = async (files: Readonly<Record<string, string>>, options?: { semi: boolean }) => {
  const base = makeInMemoryLayer(files)
  const read = (file: string) =>
    Effect.flatMap(BlueprintFileSystem, (fs) => fs.readFile(file)).pipe(Effect.provide(base))
  await Effect.runPromise(
    Effect.gen(function* () {
      const { plan } = yield* buildPlan({
        tree: [prettier.config(options), prettier.fix()],
        projectRoot: "/",
        layerFor: (config) => makeGatedLayer(base, config),
      })
      yield* applyPlan({ plan })
    }).pipe(Effect.provide(base)),
  )
  return {
    config: await Effect.runPromise(read(".prettierrc.json")),
    pkg: JSON.parse(await Effect.runPromise(read("package.json"))) as unknown,
  }
}

describe("prettier.config() applied by the engine", () => {
  it("rewrites a hand-edited config back to the managed content", async () => {
    const { config } = await remodel({ ".prettierrc.json": '{ "semi": true }' }, { semi: false })
    expect(JSON.parse(config)).toEqual({ semi: false })
  })

  it("adds format and prettier without disturbing other scripts and dependencies", async () => {
    const { pkg } = await remodel({
      "package.json": JSON.stringify({
        scripts: { test: "vitest run" },
        dependencies: { effect: "1.0.0" },
        devDependencies: { vitest: "^3.0.0" },
      }),
    })
    expect(pkg).toEqual({
      scripts: { test: "vitest run", format: "prettier --write ." },
      dependencies: { effect: "1.0.0" },
      devDependencies: { vitest: "^3.0.0", prettier: "^3.0.0" },
    })
  })
})
