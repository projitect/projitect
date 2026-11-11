import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjitectConfig } from "@projitect/core"
import type { ChangeSet } from "@projitect/core"
import { remodel } from "../src/commands/remodel.js"
import { covers, minimalKeys, overlaps, writtenFields } from "../src/merge-ownership.js"

/**
 * Merge-mode ownership, end to end: the pure segment rules, then `remodel` against a real project
 * directory to prove a failing plan leaves every byte alone and that moving or removing an owned
 * parent key never reaches a live owner's or the user's keys.
 */

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/post-apply.pjt.ts",
)

describe("segment rules", () => {
  it("covers an equal key and its descendants, never a sibling that shares a prefix", () => {
    expect(covers("scripts", "scripts")).toBe(true)
    expect(covers("scripts", "scripts.test")).toBe(true)
    expect(covers("scripts", "scripts.test.unit")).toBe(true)
    expect(covers("scripts.test", "scripts")).toBe(false)
    expect(covers("scripts.test", "scripts.testing")).toBe(false)
    expect(covers("scripts", "scriptsx")).toBe(false)
  })

  it("overlaps in either direction", () => {
    expect(overlaps("scripts", "scripts.test")).toBe(true)
    expect(overlaps("scripts.test", "scripts")).toBe(true)
    expect(overlaps("scripts.test", "scripts.testing")).toBe(false)
  })

  it("reduces keys to a sorted minimal set whatever the declaration order", () => {
    const expected = ["devDependencies.vitest", "scripts"]
    expect(minimalKeys(["scripts.test", "scripts", "devDependencies.vitest", "scripts"])).toEqual(
      expected,
    )
    expect(minimalKeys(["devDependencies.vitest", "scripts", "scripts.test"])).toEqual(expected)
  })

  it("lists the fields a deep merge writes: objects recurse, the rest replace", () => {
    expect(
      writtenFields({
        b: { y: 1, x: [1, 2] },
        a: null,
        empty: {},
        s: "text",
      }),
    ).toEqual(["a", "b.x", "b.y", "empty", "s"])
    expect(writtenFields({})).toEqual([])
    expect(writtenFields([1])).toEqual([""])
  })
})

describe("remodel with merge ownership", () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-merge-ownership-"))
  })

  afterEach(async () => {
    delete process.env["PJT_TEST_POST_APPLY"]
    await fs.rm(cwd, { recursive: true, force: true })
  })

  const config = () => ProjitectConfig.resolve({ projectRoot: cwd, blueprintFile: FIXTURE })

  const merge = (
    ownerId: string,
    ownedKeys: readonly string[],
    value: unknown,
  ): ChangeSet.Operation => ({
    _tag: "Merge",
    ownerId,
    path: "package.json",
    ownedKeys,
    value,
  })

  const declare = (
    blueprints: readonly { id: string; operations: readonly ChangeSet.Operation[] }[],
  ) => {
    process.env["PJT_TEST_POST_APPLY"] = JSON.stringify(
      blueprints.map((b) => ({ permissions: [], ...b })),
    )
  }

  const gitignore: ChangeSet.Operation = {
    _tag: "Region",
    ownerId: "pjt:ignore",
    path: ".gitignore",
    commentPrefix: "#",
    content: "dist/\n",
  }

  const snapshot = async (): Promise<Readonly<Record<string, string>>> => {
    const entries = await fs.readdir(cwd, { recursive: true, withFileTypes: true })
    return Object.fromEntries(
      await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(
            async (entry) =>
              [
                path.relative(cwd, path.join(entry.parentPath, entry.name)),
                await fs.readFile(path.join(entry.parentPath, entry.name), "utf8"),
              ] as const,
          ),
      ),
    )
  }

  const readPackage = async (): Promise<unknown> =>
    JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf8")) as unknown

  const run = () => Effect.runPromiseExit(remodel({ config: config() }))

  it("leaves every file and the lockfile untouched when owners overlap", async () => {
    await fs.writeFile(path.join(cwd, "package.json"), '{ "name": "demo" }\n', "utf8")
    await fs.writeFile(path.join(cwd, ".gitignore"), "node_modules/\n", "utf8")
    declare([
      { id: "pjt:ignore", operations: [gitignore] },
      { id: "pjt:parent", operations: [merge("pjt:parent", ["scripts"], { scripts: { a: "1" } })] },
      {
        id: "pjt:child",
        operations: [merge("pjt:child", ["scripts.test"], { scripts: { test: "2" } })],
      },
    ])
    const before = await snapshot()
    const exit = await run()
    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(exit)).toContain("pjt.plan.conflict-merge")
    expect(await snapshot()).toEqual(before)
  })

  it("leaves every file and the lockfile untouched when a merge writes an unowned field", async () => {
    await fs.writeFile(path.join(cwd, "package.json"), '{ "name": "demo" }\n', "utf8")
    declare([
      { id: "pjt:ignore", operations: [gitignore] },
      {
        id: "pjt:a",
        operations: [merge("pjt:a", ["scripts.test"], { scripts: { test: "x" }, name: "other" })],
      },
    ])
    const before = await snapshot()
    const exit = await run()
    expect(JSON.stringify(exit)).toContain("pjt.plan.unowned-merge-write")
    expect(await snapshot()).toEqual(before)
  })

  it("keeps sibling owners' and the user's keys when one owner leaves and another takes a descendant key", async () => {
    await fs.writeFile(
      path.join(cwd, "package.json"),
      '{ "name": "demo", "scripts": { "custom": "mine" } }\n',
      "utf8",
    )
    const lint = {
      id: "pjt:lint",
      operations: [merge("pjt:lint", ["scripts.lint"], { scripts: { lint: "eslint ." } })],
    }
    declare([
      {
        id: "pjt:old",
        operations: [merge("pjt:old", ["scripts.build"], { scripts: { build: "tsc" } })],
      },
      lint,
    ])
    expect(Exit.isSuccess(await run())).toBe(true)

    declare([
      lint,
      {
        id: "pjt:new",
        operations: [merge("pjt:new", ["scripts.test"], { scripts: { test: "vitest" } })],
      },
    ])
    expect(Exit.isSuccess(await run())).toBe(true)
    expect(await readPackage()).toEqual({
      name: "demo",
      scripts: { custom: "mine", lint: "eslint .", test: "vitest" },
    })
  })

  it("does not delete a live owner's children when the departing owner held the parent", async () => {
    await fs.writeFile(path.join(cwd, "package.json"), "{}\n", "utf8")
    declare([
      {
        id: "pjt:old",
        operations: [merge("pjt:old", ["scripts"], { scripts: { build: "tsc" } })],
      },
    ])
    expect(Exit.isSuccess(await run())).toBe(true)

    declare([
      {
        id: "pjt:new",
        operations: [merge("pjt:new", ["scripts.test"], { scripts: { test: "vitest" } })],
      },
    ])
    expect(Exit.isSuccess(await run())).toBe(true)
    const pkg = (await readPackage()) as { scripts: Record<string, string> }
    expect(pkg.scripts["test"]).toBe("vitest")
  })

  it("removes only the departing owner's keys and keeps the others' and the user's", async () => {
    await fs.writeFile(
      path.join(cwd, "package.json"),
      '{ "scripts": { "custom": "mine" } }\n',
      "utf8",
    )
    const keep = {
      id: "pjt:keep",
      operations: [merge("pjt:keep", ["scripts.keep"], { scripts: { keep: "k" } })],
    }
    declare([
      keep,
      {
        id: "pjt:gone",
        operations: [merge("pjt:gone", ["scripts.gone"], { scripts: { gone: "g" } })],
      },
    ])
    expect(Exit.isSuccess(await run())).toBe(true)
    declare([keep])
    expect(Exit.isSuccess(await run())).toBe(true)
    expect(await readPackage()).toEqual({ scripts: { custom: "mine", keep: "k" } })
  })
})
