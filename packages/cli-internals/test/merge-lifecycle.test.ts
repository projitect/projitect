import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ignoreSection, jsonMerge } from "@projitect/blueprint"
import { BlueprintFileSystem } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { applyPlan } from "../src/applier.js"
import { makeGatedLayer } from "../src/gated-layer.js"
import { readLockfile, writeLockfile } from "../src/lockfile.js"
import { buildPlan, diffLockfile } from "../src/plan.js"
import { applyRemovals, assertNoAmbiguousMergeClaims } from "../src/remover.js"

/**
 * The merge lifecycle through the real engine steps `pjt remodel` runs — plan, diff against the
 * lockfile, apply, remove, write the lockfile — against an in-memory project. A remodel is one
 * `remodelIn` call; the project's files and `.pjt.lock` persist between calls.
 */

type Tree = Parameters<typeof buildPlan>[0]["tree"]

const unrelated = ignoreSection({
  id: "pjt:test:ignore",
  version: "1.0.0",
  path: ".gitignore",
  content: "dist/\n",
})

const merging = (id: string, ownedKeys: readonly string[], value: unknown) =>
  jsonMerge({ id, version: "1.0.0", path: "package.json", ownedKeys, value })

const project = (files: Readonly<Record<string, string>>) => {
  const base = makeInMemoryLayer(files)
  const run = <A, E>(effect: Effect.Effect<A, E, BlueprintFileSystem>) =>
    Effect.runPromise(Effect.provide(effect, base))
  const remodelIn = (tree: Tree) =>
    run(
      Effect.gen(function* () {
        const { plan, byBlueprint } = yield* buildPlan({
          tree,
          projectRoot: "/",
          layerFor: (config) => makeGatedLayer(base, config),
        })
        const previous = yield* readLockfile
        const { removals, legacyMergeClaims } = diffLockfile({ previous, current: byBlueprint })
        yield* assertNoAmbiguousMergeClaims(legacyMergeClaims)
        yield* applyPlan({ plan })
        yield* applyRemovals({ removals })
        yield* writeLockfile({ lock: { version: 3, blueprints: byBlueprint } })
      }),
    )
  const read = (file: string) =>
    run(
      Effect.gen(function* () {
        const fs = yield* BlueprintFileSystem
        return (yield* fs.exists(file)) ? yield* fs.readFile(file) : null
      }),
    )
  const readPackage = async (): Promise<unknown> => JSON.parse((await read("package.json")) ?? "")
  const edit = (file: string, content: string) =>
    run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.writeFile(file, content)))
  const snapshot = async () => ({
    package: await read("package.json"),
    lock: await read(".pjt.lock"),
    gitignore: await read(".gitignore"),
  })
  return { remodelIn, readPackage, edit, snapshot }
}

describe("a blueprint upgrades a recorded leaf into an object", () => {
  it("keeps the new descendants and drops the old atomic value", async () => {
    const p = project({ "package.json": '{ "scripts": { "custom": "mine" } }\n' })
    await p.remodelIn([merging("pjt:a", ["scripts"], { scripts: { test: "vitest" } })])
    await p.remodelIn([
      merging("pjt:a", ["scripts"], { scripts: { test: { unit: "vitest run" } } }),
    ])
    expect(await p.readPackage()).toEqual({
      scripts: { custom: "mine", test: { unit: "vitest run" } },
    })
  })

  it("keeps the new scalar when an object leaf collapses into it", async () => {
    const p = project({ "package.json": "{}\n" })
    await p.remodelIn([
      merging("pjt:a", ["scripts"], { scripts: { test: { unit: "a", e2e: "b" } } }),
    ])
    await p.remodelIn([merging("pjt:a", ["scripts"], { scripts: { test: "vitest" } })])
    expect(await p.readPackage()).toEqual({ scripts: { test: "vitest" } })
  })

  it("still cleans up a leaf the blueprint genuinely stopped writing", async () => {
    const p = project({ "package.json": "{}\n" })
    await p.remodelIn([merging("pjt:a", ["scripts"], { scripts: { old: "1", test: "t" } })])
    await p.remodelIn([merging("pjt:a", ["scripts"], { scripts: { test: { unit: "u" } } })])
    expect(await p.readPackage()).toEqual({ scripts: { test: { unit: "u" } } })
  })
})

describe("a departing blueprint's recorded leaf has become an object", () => {
  it("keeps the children the user put there", async () => {
    const p = project({ "package.json": "{}\n" })
    await p.remodelIn([merging("pjt:a", ["scripts"], { scripts: { x: ["a"], build: "tsc" } })])
    await p.edit("package.json", '{ "scripts": { "x": { "mine": "1" }, "build": "tsc" } }\n')
    await p.remodelIn([unrelated])
    expect(await p.readPackage()).toEqual({ scripts: { x: { mine: "1" } } })
  })

  it("still deletes a leaf that is still a scalar or an array", async () => {
    const p = project({ "package.json": '{ "scripts": { "custom": "mine" } }\n' })
    await p.remodelIn([merging("pjt:a", ["scripts"], { scripts: { x: ["a"], y: "b" } })])
    await p.remodelIn([unrelated])
    expect(await p.readPackage()).toEqual({ scripts: { custom: "mine" } })
  })
})

describe("a descendant-only claim under an array or scalar the blueprint does not own", () => {
  const files = { "package.json": '{ "a": [1, 2], "keep": true }\n' }

  it("is refused before any file or the lockfile is written", async () => {
    const p = project(files)
    const before = await p.snapshot()
    await expect(
      p.remodelIn([unrelated, merging("pjt:a", ["a.b"], { a: { b: "x" } })]),
    ).rejects.toMatchObject({
      id: "pjt.apply.merge-ancestor-not-object",
    })
    expect(await p.snapshot()).toEqual(before)
    expect(before.lock).toBeNull()
    expect(before.gitignore).toBeNull()
  })

  it("is refused for a scalar or null ancestor, whatever the depth", async () => {
    const p = project({ "package.json": '{ "a": { "b": null } }\n' })
    const before = await p.snapshot()
    await expect(
      p.remodelIn([merging("pjt:a", ["a.b.c.d"], { a: { b: { c: { d: 1 } } } })]),
    ).rejects.toMatchObject({
      id: "pjt.apply.merge-ancestor-not-object",
    })
    expect(await p.snapshot()).toEqual(before)
  })

  it("replaces the array when the blueprint owns the ancestor key", async () => {
    const p = project(files)
    await p.remodelIn([merging("pjt:a", ["a"], { a: { b: "x" } })])
    expect(await p.readPackage()).toEqual({ a: { b: "x" }, keep: true })
  })

  it("writes into an absent or object ancestor", async () => {
    const p = project({ "package.json": '{ "a": { "z": 1 } }\n' })
    await p.remodelIn([merging("pjt:a", ["a.b", "c.d"], { a: { b: "x" }, c: { d: "y" } })])
    expect(await p.readPackage()).toEqual({ a: { z: 1, b: "x" }, c: { d: "y" } })
  })
})
