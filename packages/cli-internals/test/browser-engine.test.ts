import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect } from "effect"
import type { Layer } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ignoreSection, jsonMerge, ownFile } from "@projitect/blueprint"
import { BlueprintFileSystem } from "@projitect/core"
import type { Blueprint, BlueprintFileSystemShape, Errors } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import {
  applyPlan,
  buildPlan,
  diffLockfile,
  diffPlan,
  makeGatedLayer,
  readLockfile,
  writeLockfile,
} from "../src/browser.js"
import { makeProjectRootLayer, makeRealLayer } from "../src/filesystem-impl.js"

/**
 * The browser entry plans, diffs, applies and records a lockfile against an in-memory
 * `BlueprintFileSystem`, and agrees with the Node-backed path run on a real directory with the same
 * files. Only the Node-backed reference (`filesystem-impl`) is allowed to touch the disk.
 */

const seed = {
  ".gitignore": "node_modules/\n",
  "package.json": '{\n  "name": "demo"\n}\n',
}

const tree = [
  ignoreSection({
    id: "pjt:test:gitignore",
    version: "1.0.0",
    path: ".gitignore",
    content: "dist/\n",
  }),
  jsonMerge({
    id: "pjt:test:scripts",
    version: "1.0.0",
    path: "package.json",
    ownedKeys: ["scripts.build"],
    value: { scripts: { build: "tsc" } },
  }),
  ownFile({
    id: "pjt:test:generated",
    version: "1.0.0",
    path: "generated.ts",
    content: "// generated\n",
  }),
]

const inMemory = (files: Readonly<Record<string, string>>) => {
  const base = makeInMemoryLayer(files)
  return {
    base,
    layerFor: (config: Parameters<typeof makeGatedLayer>[1]) => makeGatedLayer(base, config),
  }
}

const runIn = <A, E>(
  layer: Layer.Layer<BlueprintFileSystem>,
  effect: Effect.Effect<A, E, BlueprintFileSystem>,
) => Effect.runPromise(Effect.provide(effect, layer))

type ByteAccess = (
  fs: BlueprintFileSystemShape,
  p: string,
) => Effect.Effect<unknown, Errors.FsReadFailed | Errors.FsWriteFailed | Errors.FsPermissionDenied>

describe("browser engine against the in-memory filesystem", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "projitect-browser-engine-"))
    await Promise.all(
      Object.entries(seed).map(([file, content]) => writeFile(path.join(root, file), content)),
    )
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("produces the same plan and diff as the Node-backed path", async () => {
    const { base, layerFor } = inMemory(seed)
    const browserPlan = await Effect.runPromise(buildPlan({ tree, projectRoot: "/", layerFor }))
    const nodePlan = await Effect.runPromise(
      buildPlan({ tree, projectRoot: root, layerFor: makeRealLayer }),
    )
    expect(browserPlan).toEqual(nodePlan)

    const browserDiff = await runIn(base, diffPlan({ plan: browserPlan.plan }))
    const nodeDiff = await runIn(makeProjectRootLayer(root), diffPlan({ plan: nodePlan.plan }))
    expect(browserDiff).toEqual(nodeDiff)
    expect(browserDiff.hasDrift).toBe(true)
  })

  it("applies, reports clean, and round-trips the lockfile", async () => {
    const { base, layerFor } = inMemory(seed)
    const { plan, byBlueprint } = await Effect.runPromise(
      buildPlan({ tree, projectRoot: "/", layerFor }),
    )
    const lock = { version: 2 as const, blueprints: byBlueprint }
    await runIn(
      base,
      Effect.gen(function* () {
        expect(yield* readLockfile).toBeNull()
        yield* applyPlan({ plan })
        yield* writeLockfile({ lock })
        expect((yield* diffPlan({ plan })).hasDrift).toBe(false)
        const previous = yield* readLockfile
        expect(previous).toEqual({ ...lock, version: 2 })
        expect(diffLockfile({ previous, current: byBlueprint }).removals).toEqual([])
      }),
    )
  })

  it.each([
    ["an undeclared path", ".gitignore"],
    ["a path escaping the project", "../outside"],
    ["an absolute path", "/etc/passwd"],
  ])("denies a blueprint reading %s", async (_name, target) => {
    const { layerFor } = inMemory(seed)
    const nosy: Blueprint.Blueprint = {
      id: "pjt:test:nosy",
      version: "1.0.0",
      permissions: [{ kind: "read", glob: "package.json" }],
      plan: Effect.flatMap(BlueprintFileSystem, (fs) =>
        Effect.as(fs.readFile(target), { operations: [] }),
      ),
    }
    const error = await Effect.runPromise(
      Effect.flip(buildPlan({ tree: [nosy], projectRoot: "/", layerFor })),
    )
    expect(error).toMatchObject({ id: "pjt.fs.permission-denied", blueprintId: "pjt:test:nosy" })
  })

  it.each<readonly [string, string, ByteAccess]>([
    [
      "reading an undeclared path",
      ".gitignore",
      (fs: BlueprintFileSystemShape, p: string) => fs.readFileBytes(p),
    ],
    [
      "writing a path covered only by a read permission",
      "package.json",
      (fs: BlueprintFileSystemShape, p: string) => fs.writeFileBytes(p, new Uint8Array([1])),
    ],
    [
      "reading bytes outside the project",
      "../outside",
      (fs: BlueprintFileSystemShape, p: string) => fs.readFileBytes(p),
    ],
  ])("denies byte access when %s", async (_name, target, access) => {
    const { layerFor } = inMemory(seed)
    const nosy: Blueprint.Blueprint = {
      id: "pjt:test:nosy-bytes",
      version: "1.0.0",
      permissions: [{ kind: "read", glob: "package.json" }],
      plan: Effect.flatMap(BlueprintFileSystem, (fs) =>
        Effect.as(access(fs, target), { operations: [] }),
      ),
    }
    const error = await Effect.runPromise(
      Effect.flip(buildPlan({ tree: [nosy], projectRoot: "/", layerFor })),
    )
    expect(error).toMatchObject({
      id: "pjt.fs.permission-denied",
      blueprintId: "pjt:test:nosy-bytes",
    })
  })

  it("allows byte reads and writes the blueprint declared", async () => {
    const { layerFor } = inMemory(seed)
    const reader: Blueprint.Blueprint = {
      id: "pjt:test:bytes",
      version: "1.0.0",
      permissions: [{ kind: "write", glob: "blob.bin" }],
      plan: Effect.gen(function* () {
        const fs = yield* BlueprintFileSystem
        yield* fs.writeFileBytes("blob.bin", new Uint8Array([1, 2, 3]))
        expect(Array.from(yield* fs.readFileBytes("blob.bin"))).toEqual([1, 2, 3])
        return { operations: [] }
      }),
    }
    await Effect.runPromise(buildPlan({ tree: [reader], projectRoot: "/", layerFor }))
  })
})
