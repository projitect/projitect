import { Effect } from "effect"
import type { Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { BlueprintFileSystem } from "@projitect/core"
import type { PjtLock } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { applyPlan } from "../src/applier.js"
import { diffPlan } from "../src/differ.js"
import { readLockfile, writeLockfile } from "../src/lockfile.js"
import { applyRemovals } from "../src/remover.js"
import type { ProjectPlan } from "../src/plan.js"

/**
 * The engine (differ, applier, lockfile, remover) runs against the in-memory `BlueprintFileSystem`
 * with no Node file access: this is the end-to-end proof that plan + drift logic is Node-free.
 */

const plan: ProjectPlan = {
  commands: [],
  files: [
    {
      _tag: "Region",
      path: ".gitignore",
      commentPrefix: "#",
      commentSuffix: "",
      regions: [{ ownerId: "pjt:a", content: ".DS_Store\n" }],
    },
    { _tag: "Owned", path: "generated.ts", ownerId: "pjt:gen", content: "// generated\n" },
  ],
}

let layer: Layer.Layer<BlueprintFileSystem>

beforeEach(() => {
  layer = makeInMemoryLayer()
})

const run = <A, E>(effect: Effect.Effect<A, E, BlueprintFileSystem>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, layer))

const writeFile = (path: string, content: string): Promise<void> =>
  run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.writeFile(path, content)))

const exists = (path: string): Promise<boolean> =>
  run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.exists(path)))

describe("engine against the in-memory filesystem", () => {
  it("reports every file missing before apply", async () => {
    const diff = await run(diffPlan({ plan }))
    expect(diff.hasDrift).toBe(true)
    expect(diff.files.map((f) => f.status)).toEqual(["create", "create"])
  })

  it("reports clean after apply", async () => {
    const written = await run(applyPlan({ plan }))
    expect(written).toEqual([".gitignore", "generated.ts"])
    const diff = await run(diffPlan({ plan }))
    expect(diff.hasDrift).toBe(false)
  })

  it("reports drift when a managed file is edited", async () => {
    await run(applyPlan({ plan }))
    await writeFile("generated.ts", "// hand edited\n")
    const diff = await run(diffPlan({ plan }))
    expect(diff.hasDrift).toBe(true)
    expect(diff.files.map((f) => f.status)).toEqual(["ok", "modify"])
  })

  it("reports drift when a managed file is missing", async () => {
    await run(applyPlan({ plan }))
    await run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.remove(".gitignore")))
    const diff = await run(diffPlan({ plan }))
    expect(diff.files.map((f) => f.status)).toEqual(["create", "ok"])
  })

  it("round-trips the lockfile through the service", async () => {
    const lock: PjtLock.PjtLock = {
      version: 3,
      blueprints: {
        "pjt:a": {
          version: "1",
          operations: [{ _tag: "Owned", path: "generated.ts", ownerId: "pjt:a" }],
        },
      },
    }
    expect(await run(readLockfile)).toBeNull()
    await run(writeLockfile({ lock }))
    expect(await exists(".pjt.lock")).toBe(true)
    expect(await run(readLockfile)).toEqual(lock)
  })

  it("deletes an orphaned owned file through the service", async () => {
    await run(applyPlan({ plan }))
    const removed = await run(
      applyRemovals({
        removals: [{ _tag: "Owned", path: "generated.ts", ownerId: "pjt:a" }],
      }),
    )
    expect(removed).toEqual(["generated.ts"])
    expect(await exists("generated.ts")).toBe(false)
  })
})
