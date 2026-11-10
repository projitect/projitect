import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { gitignores } from "@projitect/blueprint-gitignore"
import { makeProjectRootLayer, makeRealLayer } from "../src/filesystem-impl.js"
import { diffPlan } from "../src/differ.js"
import { applyPlan } from "../src/applier.js"
import { readLockfile, writeLockfile } from "../src/lockfile.js"
import { buildPlan, diffLockfile } from "../src/plan.js"

/**
 * Composing every `@projitect/blueprint-gitignore` section into one `.gitignore` builds without
 * a `pjt.plan.conflict`, and `pjt inspect` (`diffPlan` + `diffLockfile`) then reports no drift.
 */

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-gitignore-lifecycle-"))
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

describe("blueprint-gitignore lifecycle", () => {
  it("builds every section into one .gitignore with no conflict and no drift", async () => {
    const tree = Object.values(gitignores).map((section) => section())
    const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

    await run(
      Effect.gen(function* () {
        const { plan, byBlueprint } = yield* buildPlan({
          tree,
          projectRoot: cwd,
          layerFor: makeRealLayer,
        })
        yield* applyPlan({ plan })
        yield* writeLockfile({ lock: { version: 1, blueprints: byBlueprint } })
      }).pipe(Effect.provide(makeProjectRootLayer(cwd))),
    )

    const gitignore = await fs.readFile(path.join(cwd, ".gitignore"), "utf8")
    for (const blueprint of tree) {
      expect(gitignore).toContain(`# ${blueprint.id} start\n`)
      expect(gitignore).toContain(`# ${blueprint.id} end\n`)
    }

    const report = await run(
      Effect.gen(function* () {
        const { plan, byBlueprint } = yield* buildPlan({
          tree,
          projectRoot: cwd,
          layerFor: makeRealLayer,
        })
        const previous = yield* readLockfile
        const { removals } = diffLockfile({ previous, current: byBlueprint })
        const diff = yield* diffPlan({ plan })
        return { hasDrift: diff.hasDrift || removals.length > 0 }
      }).pipe(Effect.provide(makeProjectRootLayer(cwd))),
    )
    expect(report.hasDrift).toBe(false)
  })
})
