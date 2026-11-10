import { Effect } from "effect"
import type { Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { BlueprintFileSystem } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import type { PjtLock } from "@projitect/core"
import { blueprintIds, readLockfile, writeLockfile } from "../src/lockfile.js"

/**
 * Lockfile round-trip + error-path tests.
 *
 * `.pjt.lock` is the source of truth for "what was previously applied" — without a correct
 * round-trip, drift detection misreports and the orphan-removal pipeline can't tell which
 * blueprints have left the tree. So the round-trip is the load-bearing assertion here; the rest
 * of the tests are error paths (`pjt.lock.parse-failed`, `pjt.lock.version-mismatch`) that the
 * v0.1 plan said had to fire on the right inputs.
 */

let layer: Layer.Layer<BlueprintFileSystem>

beforeEach(() => {
  layer = makeInMemoryLayer()
})

const run = <A, E>(effect: Effect.Effect<A, E, BlueprintFileSystem>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, layer))

const writeFile = (relative: string, content: string): Promise<void> =>
  run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.writeFile(relative, content)))

const readFile = (relative: string): Promise<string> =>
  run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.readFile(relative)))

const lockfile = (overrides: Partial<PjtLock.PjtLock> = {}): PjtLock.PjtLock => ({
  version: 2,
  blueprints: {
    "pjt:a": {
      version: "1.0.0",
      operations: [{ _tag: "Region", path: ".gitignore", ownerId: "pjt:a", commentPrefix: "#" }],
    },
    "pjt:b": {
      version: "2.0.0",
      operations: [
        { _tag: "Merge", path: "package.json", ownedKeys: ["scripts.test"] },
        { _tag: "Owned", path: "generated.ts", ownerId: "pjt:b" },
      ],
    },
  },
  ...overrides,
})

const runError = <E>(effect: Effect.Effect<unknown, E, BlueprintFileSystem>): Promise<E> =>
  Effect.runPromise(Effect.provide(Effect.flip(effect), layer))

describe("readLockfile / writeLockfile round-trip", () => {
  it("returns null when no lockfile exists (fresh project)", async () => {
    const out = await run(readLockfile)
    expect(out).toBeNull()
  })

  it("writes a lockfile and reads it back unchanged", async () => {
    const original = lockfile()
    await run(writeLockfile({ lock: original }))
    const out = await run(readLockfile)
    expect(out).toEqual(original)
  })

  it("writes the lockfile with trailing newline and 2-space indent", async () => {
    await run(writeLockfile({ lock: lockfile() }))
    const raw = await readFile(".pjt.lock")
    expect(raw.endsWith("\n")).toBe(true)
    expect(raw).toContain('  "version": 2')
  })

  it("preserves a region operation's commentSuffix when set", async () => {
    const original: PjtLock.PjtLock = {
      version: 2,
      blueprints: {
        "pjt:md": {
          version: "1",
          operations: [
            {
              _tag: "Region",
              path: "README.md",
              ownerId: "pjt:md",
              commentPrefix: "<!--",
              commentSuffix: " -->",
            },
          ],
        },
      },
    }
    await run(writeLockfile({ lock: original }))
    const out = await run(readLockfile)
    expect(out).toEqual(original)
  })

  it("decodes an older lockfile without commentSuffix (backwards compat)", async () => {
    // Hand-write a lockfile shaped like a pre-suffix version.
    const raw = {
      version: 1,
      blueprints: {
        "pjt:old": {
          version: "1",
          operations: [
            {
              _tag: "Region",
              path: ".gitignore",
              ownerId: "pjt:old",
              commentPrefix: "#",
              // No commentSuffix field
            },
          ],
        },
      },
    }
    await writeFile(".pjt.lock", `${JSON.stringify(raw, null, 2)}\n`)
    const out = await run(readLockfile)
    expect(out).not.toBeNull()
    expect(out?.blueprints["pjt:old"]?.operations[0]).toEqual({
      _tag: "Region",
      path: ".gitignore",
      ownerId: "pjt:old",
      commentPrefix: "#",
    })
  })

  it("preserves operations across all four ownership modes", async () => {
    const original: PjtLock.PjtLock = {
      version: 2,
      blueprints: {
        "pjt:r": {
          version: "1",
          operations: [
            { _tag: "Region", path: ".gitignore", ownerId: "pjt:r", commentPrefix: "#" },
          ],
        },
        "pjt:m": {
          version: "1",
          operations: [{ _tag: "Merge", path: "package.json", ownedKeys: ["a", "b.c"] }],
        },
        "pjt:o": {
          version: "1",
          operations: [{ _tag: "Owned", path: "x.ts", ownerId: "pjt:o" }],
        },
        "pjt:s": {
          version: "1",
          operations: [{ _tag: "Seed", path: ".pjt.ts", ownerId: "pjt:s" }],
        },
      },
    }
    await run(writeLockfile({ lock: original }))
    const out = await run(readLockfile)
    expect(out).toEqual(original)
  })
})

describe("lockfile versions", () => {
  it("reads a v1 lockfile without error", async () => {
    const v1 = { ...lockfile(), version: 1 }
    await writeFile(".pjt.lock", JSON.stringify(v1))
    const out = await run(readLockfile)
    expect(out).toEqual(v1)
  })

  it("writes a v1 lock back as v2 and keeps every operation", async () => {
    const v1: PjtLock.PjtLock = {
      version: 1,
      blueprints: {
        "pjt:r": {
          version: "1",
          operations: [
            {
              _tag: "Region",
              path: "README.md",
              ownerId: "pjt:r",
              commentPrefix: "<!--",
              commentSuffix: " -->",
            },
            { _tag: "Region", path: ".gitignore", ownerId: "pjt:r", commentPrefix: "#" },
          ],
        },
        "pjt:m": {
          version: "1",
          operations: [{ _tag: "Merge", path: "package.json", ownedKeys: ["a", "b.c"] }],
        },
        "pjt:o": {
          version: "1",
          operations: [
            { _tag: "Owned", path: "skills", ownerId: "pjt:o", ownedDir: "skills" },
            { _tag: "Owned", path: "logo.png", ownerId: "pjt:o", contentHash: "sha256:abc" },
          ],
        },
        "pjt:s": {
          version: "1",
          operations: [{ _tag: "Seed", path: ".pjt.ts", ownerId: "pjt:s" }],
        },
      },
    }
    await run(writeLockfile({ lock: v1 }))
    expect(JSON.parse(await readFile(".pjt.lock"))).toEqual({ ...v1, version: 2 })
    expect(await run(readLockfile)).toEqual({ ...v1, version: 2 })
  })

  it("round-trips a v2 lockfile with and without a content hash", async () => {
    const original: PjtLock.PjtLock = {
      version: 2,
      blueprints: {
        "pjt:assets": {
          version: "1",
          operations: [
            {
              _tag: "Owned",
              path: "logo.png",
              ownerId: "pjt:assets",
              contentHash: "sha256:abc123",
            },
            { _tag: "Owned", path: "notes.ts", ownerId: "pjt:assets" },
          ],
        },
      },
    }
    await run(writeLockfile({ lock: original }))
    expect(await readFile(".pjt.lock")).toContain('  "version": 2')
    const out = await run(readLockfile)
    expect(out).toEqual(original)
  })
})

describe("readLockfile — error paths", () => {
  it("fails with pjt.lock.parse-failed on corrupted JSON", async () => {
    await writeFile(".pjt.lock", "{ not json")
    const err = await runError(readLockfile)
    expect(err._tag).toBe("LockParseFailed")
    expect(err.id).toBe("pjt.lock.parse-failed")
  })

  it("fails with pjt.lock.parse-failed when the JSON doesn't match the schema", async () => {
    await writeFile(
      ".pjt.lock",
      JSON.stringify({ version: 1, blueprints: { x: { version: "1" /* Missing operations */ } } }),
    )
    const err = await runError(readLockfile)
    expect(err._tag).toBe("LockParseFailed")
  })

  it("fails with pjt.lock.version-mismatch when written by a newer projitect", async () => {
    await writeFile(".pjt.lock", JSON.stringify({ version: 999, blueprints: {} }))
    const err = await runError(readLockfile)
    expect(err._tag).toBe("LockVersionMismatch")
    expect(err.id).toBe("pjt.lock.version-mismatch")
  })

  it("rejects the first unsupported version with pjt.lock.version-mismatch", async () => {
    await writeFile(".pjt.lock", JSON.stringify({ version: 3, blueprints: {} }))
    const err = await runError(readLockfile)
    expect(err).toMatchObject({ id: "pjt.lock.version-mismatch", found: 3, expected: 2 })
  })
})

describe("blueprintIds", () => {
  it("returns an empty set on null input (no lockfile yet)", () => {
    expect(blueprintIds(null).size).toBe(0)
  })

  it("collects every top-level blueprint id from the lockfile", () => {
    const ids = blueprintIds(lockfile())
    expect([...ids].toSorted()).toEqual(["pjt:a", "pjt:b"])
  })
})
