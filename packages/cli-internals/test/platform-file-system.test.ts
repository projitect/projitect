import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect, FileSystem } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FileSystemLive } from "../src/platform/file-system.js"

const ROOT = path.join(os.tmpdir(), "projitect-test-platform-fs")

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(`${ROOT}-`)
  await fs.mkdir(path.join(cwd, "nested"))
  await Promise.all([
    fs.writeFile(path.join(cwd, "root.ts"), ""),
    fs.writeFile(path.join(cwd, "nested", "include.ts"), ""),
    fs.writeFile(path.join(cwd, "nested", "exclude.test.ts"), ""),
    fs.writeFile(path.join(cwd, "nested", "ignore.js"), ""),
  ])
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

const glob = (
  pattern: string,
  options?: { readonly root?: string; readonly exclude?: readonly string[] },
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    return yield* fileSystem.glob(pattern, {
      root: options?.root ?? cwd,
      exclude: options?.exclude,
    })
  }).pipe(Effect.provide(FileSystemLive))

describe("FileSystemLive.glob", () => {
  it("returns matches relative to the requested root", async () => {
    const matches = await Effect.runPromise(glob("**/*.ts"))

    expect(matches.toSorted()).toEqual(["nested/exclude.test.ts", "nested/include.ts", "root.ts"])
  })

  it("forwards exclude patterns", async () => {
    const matches = await Effect.runPromise(glob("**/*.ts", { exclude: ["**/*.test.ts"] }))

    expect(matches.toSorted()).toEqual(["nested/include.ts", "root.ts"])
  })
})
