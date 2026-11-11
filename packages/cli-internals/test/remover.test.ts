import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect, Exit, Layer } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { BlueprintFileSystem } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { makeProjectRootLayer } from "../src/filesystem-impl.js"
import { applyRemovals, assertNoAmbiguousMergeClaims } from "../src/remover.js"

/**
 * Tests for `remover.ts` — the path that fires when a blueprint *leaves* `.pjt.ts` and its
 * previously-applied operations need to be unwound from disk. This is what makes "swap frameworks
 * cleanly" actually deliver: removing a blueprint must also delete the stuff it added.
 *
 * Coverage:
 *  - region removal preserves surrounding content (and the marker pair gets deleted, not just the
 *    body)
 *  - merge removal deep-deletes dotted keys and prunes now-empty parent objects so the file
 *    doesn't bloat with `"scripts": {}`
 *  - owned removal deletes the file
 *  - seed removal is a no-op (write-once; we never delete what the user might have edited)
 *  - missing files / missing regions are silently skipped (the file may have been hand-deleted)
 *  - touched-paths return value lists exactly the paths actually mutated
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

const exists = (relative: string): Promise<boolean> =>
  run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.exists(relative)))

describe("applyRemovals — region", () => {
  it("removes the marker pair + body, preserving surrounding content", async () => {
    await writeFile(
      ".gitignore",
      [
        "header",
        "# pjt:gitignore:macos start",
        ".DS_Store",
        ".AppleDouble",
        "# pjt:gitignore:macos end",
        "footer",
        "",
      ].join("\n"),
    )

    const touched = await run(
      applyRemovals({
        removals: [
          {
            _tag: "Region",
            path: ".gitignore",
            ownerId: "pjt:gitignore:macos",
            commentPrefix: "#",
          },
        ],
      }),
    )

    expect(touched).toEqual([".gitignore"])
    expect(await readFile(".gitignore")).toBe(["header", "footer", ""].join("\n"))
  })

  it("is silent when the file doesn't exist (already cleaned up)", async () => {
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Region", path: "nope.txt", ownerId: "pjt:x", commentPrefix: "#" }],
      }),
    )
    expect(touched).toEqual([])
  })

  it("is silent when the region marker pair is no longer in the file", async () => {
    await writeFile(".gitignore", "user-written\n.env\n")
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Region", path: ".gitignore", ownerId: "pjt:gone", commentPrefix: "#" }],
      }),
    )
    expect(touched).toEqual([])
    expect(await readFile(".gitignore")).toBe("user-written\n.env\n")
  })
})

describe("applyRemovals — merge", () => {
  it("deletes dotted keys from a JSON file and prunes empty parents", async () => {
    await writeFile(
      "package.json",
      `${JSON.stringify(
        {
          name: "x",
          scripts: { pjt: "pjt", test: "vitest" },
          devDependencies: { "@projitect/cli": "^0", effect: "^4" },
        },
        null,
        2,
      )}\n`,
    )

    const touched = await run(
      applyRemovals({
        removals: [
          {
            _tag: "Merge",
            path: "package.json",
            ownedKeys: ["scripts.pjt", "devDependencies.@projitect/cli"],
          },
        ],
      }),
    )

    expect(touched).toEqual(["package.json"])
    const remaining = JSON.parse(await readFile("package.json")) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(remaining.scripts).toEqual({ test: "vitest" })
    expect(remaining.devDependencies).toEqual({ effect: "^4" })
  })

  it("prunes a parent object once the last owned key is removed", async () => {
    await writeFile(
      "package.json",
      `${JSON.stringify({ name: "x", scripts: { pjt: "pjt" } }, null, 2)}\n`,
    )

    await run(
      applyRemovals({
        removals: [{ _tag: "Merge", path: "package.json", ownedKeys: ["scripts.pjt"] }],
      }),
    )

    const remaining = JSON.parse(await readFile("package.json")) as Record<string, unknown>
    expect(remaining).toEqual({ name: "x" })
  })

  it("is a no-op when the file's JSON does not contain the owned key", async () => {
    await writeFile("package.json", `${JSON.stringify({ name: "x" }, null, 2)}\n`)
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Merge", path: "package.json", ownedKeys: ["scripts.pjt"] }],
      }),
    )
    expect(touched).toEqual([])
  })

  it("is a no-op when the file is unparseable JSON (don't corrupt user state further)", async () => {
    await writeFile("package.json", "{not json")
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Merge", path: "package.json", ownedKeys: ["scripts.pjt"] }],
      }),
    )
    expect(touched).toEqual([])
    expect(await readFile("package.json")).toBe("{not json")
  })
})

describe("applyRemovals — merge written fields", () => {
  const removal = (writtenPaths: readonly string[]) =>
    applyRemovals({
      removals: [{ _tag: "Merge", path: "package.json", ownedKeys: ["scripts"], writtenPaths }],
    })

  it("deletes only the recorded fields and keeps other children of the owned parent", async () => {
    await writeFile(
      "package.json",
      `${JSON.stringify({ scripts: { build: "tsc", custom: "mine" } })}\n`,
    )
    expect(await run(removal(["scripts.build"]))).toEqual(["package.json"])
    expect(JSON.parse(await readFile("package.json"))).toEqual({ scripts: { custom: "mine" } })
  })

  it("prunes a parent the deletion emptied, but not one that still holds keys", async () => {
    await writeFile(
      "package.json",
      `${JSON.stringify({ a: { b: { c: 1 } }, x: { y: 1, z: 2 } })}\n`,
    )
    await run(removal(["a.b.c", "x.y"]))
    expect(JSON.parse(await readFile("package.json"))).toEqual({ x: { z: 2 } })
  })

  it("deletes an array or scalar leaf as a whole field", async () => {
    await writeFile("package.json", `${JSON.stringify({ files: ["a", "b"], name: "x" })}\n`)
    await run(removal(["files"]))
    expect(JSON.parse(await readFile("package.json"))).toEqual({ name: "x" })
  })

  it("leaves a legacy claim over an object with children alone", async () => {
    await writeFile("package.json", `${JSON.stringify({ scripts: { custom: "mine" } })}\n`)
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Merge", path: "package.json", ownedKeys: ["scripts"] }],
      }),
    )
    expect(touched).toEqual([])
    expect(JSON.parse(await readFile("package.json"))).toEqual({ scripts: { custom: "mine" } })
  })
})

describe("assertNoAmbiguousMergeClaims", () => {
  const claim = { blueprintId: "pjt:old", path: "package.json", key: "scripts" }

  it("fails naming the file, key and owner when the key holds an object with children", async () => {
    await writeFile("package.json", `${JSON.stringify({ scripts: { custom: "mine" } })}\n`)
    const error = await Effect.runPromise(
      Effect.provide(Effect.flip(assertNoAmbiguousMergeClaims([claim])), layer),
    )
    expect(error).toMatchObject({
      id: "pjt.remove.ambiguous-merge-claim",
      path: "package.json",
      key: "scripts",
      ownerId: "pjt:old",
    })
  })

  it("passes when the key is absent, a scalar, an array or an empty object", async () => {
    await writeFile("package.json", `${JSON.stringify({ scripts: "x", list: [1], empty: {} })}\n`)
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        assertNoAmbiguousMergeClaims([
          claim,
          { ...claim, key: "list" },
          { ...claim, key: "empty" },
          { ...claim, key: "missing" },
        ]),
        layer,
      ),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})

describe("applyRemovals — owned", () => {
  it("deletes the owned file", async () => {
    await writeFile("generated.ts", "// generated\n")
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Owned", path: "generated.ts", ownerId: "pjt:gen" }],
      }),
    )
    expect(touched).toEqual(["generated.ts"])
    expect(await exists("generated.ts")).toBe(false)
  })

  it("is fine when the owned file is already missing", async () => {
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Owned", path: "already-gone.ts", ownerId: "pjt:gen" }],
      }),
    )
    expect(touched).toEqual(["already-gone.ts"])
  })

  it("keeps user content when the owned path is now a directory", async () => {
    await writeFile("generated/user.md", "u")
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Owned", path: "generated", ownerId: "pjt:gen" }],
      }),
    )
    expect(touched).toEqual([])
    expect(await exists("generated/user.md")).toBe(true)
  })
})

describe("applyRemovals — seed", () => {
  it("is a no-op (seed is write-once; the user owns the file after first apply)", async () => {
    await writeFile(".pjt.ts", "export default pjt({ blueprints: [] })\n")
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Seed", path: ".pjt.ts", ownerId: "pjt:projitect:seed" }],
      }),
    )
    expect(touched).toEqual([])
    expect(await exists(".pjt.ts")).toBe(true)
  })
})

describe("applyRemovals — touched-paths return value", () => {
  it("lists only the paths that were actually mutated", async () => {
    await writeFile(".gitignore", ["# pjt:a start", "x", "# pjt:a end", ""].join("\n"))
    // Intentionally NOT creating package.json

    const touched = await run(
      applyRemovals({
        removals: [
          { _tag: "Region", path: ".gitignore", ownerId: "pjt:a", commentPrefix: "#" },
          { _tag: "Merge", path: "package.json", ownedKeys: ["scripts.x"] },
        ],
      }),
    )

    expect(touched).toEqual([".gitignore"])
  })
})

/**
 * Directory pruning needs real directories (the in-memory layer has no directory entries), so
 * these run against the project-root Node layer in a temp dir.
 */
describe("applyRemovals — owned dir pruning (disk)", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-remover-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const put = async (relative: string, content: string) => {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true })
    await fs.writeFile(path.join(root, relative), content, "utf8")
  }
  const present = (relative: string) =>
    fs.access(path.join(root, relative)).then(
      () => true,
      () => false,
    )
  const remove = (removals: Parameters<typeof applyRemovals>[0]["removals"]) =>
    Effect.runPromise(Effect.provide(applyRemovals({ removals }), makeProjectRootLayer(root)))

  it("prunes empty directories up to the owned dir, but not above it", async () => {
    await put("agents/skills/a/nested/x.md", "x")
    await remove([
      {
        _tag: "Owned",
        path: "agents/skills/a/nested/x.md",
        ownerId: "pjt:s",
        ownedDir: "agents/skills/a",
      },
    ])
    expect(await present("agents/skills/a")).toBe(false)
    expect(await present("agents/skills")).toBe(true)
    expect(await present("agents")).toBe(true)
  })

  it("keeps the owned dir while it still holds other files", async () => {
    await put("skills/c/keep.md", "k")
    await put("skills/c/gone.md", "g")
    await remove([
      { _tag: "Owned", path: "skills/c/gone.md", ownerId: "pjt:s", ownedDir: "skills/c" },
    ])
    expect(await present("skills/c/keep.md")).toBe(true)
  })

  it("keeps an entry that appears just before the directory is removed", async () => {
    await put("skills/c/gone.md", "g")
    const base = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* BlueprintFileSystem
        }),
        makeProjectRootLayer(root),
      ),
    )
    // The unmanaged file lands after the caller last looked, right before the directory removal.
    const racing = Layer.succeed(BlueprintFileSystem, {
      ...base,
      removeEmptyDir: (dir) =>
        Effect.flatMap(
          Effect.promise(() => put(`${dir}/late.md`, "user")),
          () => base.removeEmptyDir(dir),
        ),
    })
    await Effect.runPromise(
      Effect.provide(
        applyRemovals({
          removals: [
            { _tag: "Owned", path: "skills/c/gone.md", ownerId: "pjt:s", ownedDir: "skills/c" },
          ],
        }),
        racing,
      ),
    )
    expect(await present("skills/c/late.md")).toBe(true)
  })

  it("keeps user content when the formerly owned path is now a directory", async () => {
    await put("skills/c/gone.md/user.md", "u")
    await put("skills/c/gone.md/deep/more.md", "m")
    const touched = await remove([
      { _tag: "Owned", path: "skills/c/gone.md", ownerId: "pjt:s", ownedDir: "skills/c" },
    ])
    expect(touched).toEqual([])
    expect(await present("skills/c/gone.md/user.md")).toBe(true)
    expect(await present("skills/c/gone.md/deep/more.md")).toBe(true)
  })

  it("prunes nothing when the op names no owned dir", async () => {
    await put("pre/existing/f.md", "f")
    await remove([{ _tag: "Owned", path: "pre/existing/f.md", ownerId: "pjt:s" }])
    expect(await present("pre/existing")).toBe(true)
  })
})
