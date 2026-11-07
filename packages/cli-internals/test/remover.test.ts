import { Effect } from "effect"
import type { Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { BlueprintFileSystem } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { applyRemovals } from "../src/remover.js"

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
          devDependencies: { effect: "^4", projitect: "^0" },
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
            ownedKeys: ["scripts.pjt", "devDependencies.projitect"],
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

  it("prunes empty directories up to the owned dir, but not above it", async () => {
    await fs.mkdir(path.join(cwd, "agents/skills/a/nested"), { recursive: true })
    await writeFile("agents/skills/a/nested/x.md", "x")
    await run(
      applyRemovals({
        projectRoot: cwd,
        removals: [
          {
            _tag: "Owned",
            path: "agents/skills/a/nested/x.md",
            ownerId: "pjt:s",
            ownedDir: "agents/skills/a",
          },
        ],
      }),
    )
    expect(await exists("agents/skills/a")).toBe(false)
    expect(await exists("agents/skills")).toBe(true)
    expect(await exists("agents")).toBe(true)
  })

  it("keeps the owned dir while it still holds other files", async () => {
    await fs.mkdir(path.join(cwd, "skills/c"), { recursive: true })
    await writeFile("skills/c/keep.md", "k")
    await writeFile("skills/c/gone.md", "g")
    await run(
      applyRemovals({
        projectRoot: cwd,
        removals: [
          { _tag: "Owned", path: "skills/c/gone.md", ownerId: "pjt:s", ownedDir: "skills/c" },
        ],
      }),
    )
    expect(await exists("skills/c/keep.md")).toBe(true)
  })

  it("prunes nothing when the op names no owned dir", async () => {
    await fs.mkdir(path.join(cwd, "pre/existing"), { recursive: true })
    await writeFile("pre/existing/f.md", "f")
    await run(
      applyRemovals({
        projectRoot: cwd,
        removals: [{ _tag: "Owned", path: "pre/existing/f.md", ownerId: "pjt:s" }],
      }),
    )
    expect(await exists("pre/existing")).toBe(true)
  })

  it("is fine when the owned file is already missing", async () => {
    const touched = await run(
      applyRemovals({
        removals: [{ _tag: "Owned", path: "already-gone.ts", ownerId: "pjt:gen" }],
      }),
    )
    expect(touched).toEqual(["already-gone.ts"])
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
