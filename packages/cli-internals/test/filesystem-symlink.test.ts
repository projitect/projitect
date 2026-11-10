import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect, Exit } from "effect"
import type { Permission } from "@projitect/core"
import { BlueprintFileSystem } from "@projitect/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { makeRealLayer } from "../src/filesystem-impl.js"

const permissions: readonly Permission.Permission[] = [{ kind: "write", glob: "**" }]

let base: string
let root: string
let outside: string

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-symlink-"))
  root = path.join(base, "project")
  outside = path.join(base, "outside")
  await fs.mkdir(root)
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, "secret.txt"), "secret")
  await fs.mkdir(path.join(root, "real"))
  await fs.writeFile(path.join(root, "real", "ok.txt"), "ok")
  await fs.symlink(outside, path.join(root, "escape"))
  await fs.symlink(path.join(root, "real"), path.join(root, "inside"))
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

const run = <A, E>(
  projectRoot: string,
  use: (fs: BlueprintFileSystem["Service"]) => Effect.Effect<A, E>,
  perms: readonly Permission.Permission[] = permissions,
  directoryPrefix = "",
) =>
  Effect.runPromiseExit(
    Effect.gen(function* () {
      return yield* use(yield* BlueprintFileSystem)
    }).pipe(
      Effect.provide(
        makeRealLayer({ blueprintId: "t", permissions: perms, projectRoot, directoryPrefix }),
      ),
    ),
  )

describe("symlink-safe permission gate", () => {
  it("denies reading through a symlink that points outside the project", async () => {
    const exit = await run(root, (f) => f.readFile("escape/secret.txt"))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(exit)).toContain("pjt.fs.permission-denied")
  })

  it("denies writing through a symlink that points outside the project", async () => {
    const exit = await run(root, (f) => f.writeFile("escape/new.txt", "x"))
    expect(Exit.isFailure(exit)).toBe(true)
    await expect(fs.access(path.join(outside, "new.txt"))).rejects.toThrow()
  })

  it("denies when the link path matches the glob but the real path does not", async () => {
    const exit = await run(root, (f) => f.readFile("inside/ok.txt"), [
      { kind: "read", glob: "inside/**" },
    ])
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("allows a symlink that stays inside the allowed area", async () => {
    const exit = await run(root, (f) => f.readFile("inside/ok.txt"))
    expect(exit).toEqual(Exit.succeed("ok"))
  })

  it("denies write and mkdir through a dangling symlink to a missing path outside the project", async () => {
    await fs.symlink(path.join(outside, "new.txt"), path.join(root, "escape-file"))
    const written = await run(root, (f) => f.writeFile("escape-file", "x"))
    expect(JSON.stringify(written)).toContain("pjt.fs.permission-denied")
    const made = await run(root, (f) => f.mkdir("escape-file"))
    expect(JSON.stringify(made)).toContain("pjt.fs.permission-denied")
    await expect(fs.lstat(path.join(outside, "new.txt"))).rejects.toThrow()
  })

  it("allows write through a dangling symlink whose missing target stays inside the project", async () => {
    await fs.symlink(path.join(root, "real", "later.txt"), path.join(root, "soon"))
    const exit = await run(root, (f) => f.writeFile("soon", "x"))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(await fs.readFile(path.join(root, "real", "later.txt"), "utf8")).toBe("x")
  })

  it("denies a circular symlink without hanging", async () => {
    await fs.symlink(path.join(root, "loop-b"), path.join(root, "loop-a"))
    await fs.symlink(path.join(root, "loop-a"), path.join(root, "loop-b"))
    const exit = await run(root, (f) => f.writeFile("loop-a", "x"))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("resolves a symlinked project root", async () => {
    const linkedRoot = path.join(base, "linked-root")
    await fs.symlink(root, linkedRoot)
    const exit = await run(linkedRoot, (f) => f.readFile("real/ok.txt"))
    expect(exit).toEqual(Exit.succeed("ok"))
  })
})

describe("directory() prefix bounded by the original project root", () => {
  const readWrite: readonly Permission.Permission[] = [
    { kind: "read", glob: "**" },
    { kind: "write", glob: "**" },
  ]

  // Reads the outside marker and writes beside it through `prefix`; `outsideTouched` is whether
  // the marker changed or a new file appeared there.
  const attempt = async (prefix: string) => {
    const read = await run(root, (f) => f.readFile("secret.txt"), readWrite, prefix)
    const written = await run(root, (f) => f.writeFile("new.txt", "x"), readWrite, prefix)
    return {
      denied: [read, written].map((exit) =>
        JSON.stringify(exit).includes("pjt.fs.permission-denied"),
      ),
      outsideTouched: await fs.readdir(outside),
    }
  }

  it("denies reads and writes when the prefix climbs out of the project", async () => {
    expect(await attempt("../outside")).toEqual({
      denied: [true, true],
      outsideTouched: ["secret.txt"],
    })
  })

  it("denies reads and writes when the prefix root is a symlink pointing outside", async () => {
    expect(await attempt("escape")).toEqual({
      denied: [true, true],
      outsideTouched: ["secret.txt"],
    })
  })

  it("denies reads and writes when a nested, not-yet-existing prefix sits under an outside link", async () => {
    expect(await attempt("escape/future")).toEqual({
      denied: [true, true],
      outsideTouched: ["secret.txt"],
    })
  })

  it("roots the blueprint at the nested directory", async () => {
    await fs.writeFile(path.join(root, "ok.txt"), "project root")
    const exit = await run(root, (f) => f.readFile("ok.txt"), readWrite, "real")
    expect(exit).toEqual(Exit.succeed("ok"))
  })

  it("keeps the inner-symlink denial inside a nested directory", async () => {
    await fs.symlink(outside, path.join(root, "real", "out"))
    const exit = await run(root, (f) => f.readFile("out/secret.txt"), readWrite, "real")
    expect(JSON.stringify(exit)).toContain("pjt.fs.permission-denied")
  })

  it("accepts a prefix under an alias of the project root", async () => {
    const linkedRoot = path.join(base, "linked-root")
    await fs.symlink(root, linkedRoot)
    const exit = await run(linkedRoot, (f) => f.readFile("ok.txt"), readWrite, "real")
    expect(exit).toEqual(Exit.succeed("ok"))
  })

  it("accepts a future directory inside the project and creates it there", async () => {
    const exit = await run(root, (f) => f.writeFile("note.txt", "x"), readWrite, "later/docs")
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(await fs.readFile(path.join(root, "later", "docs", "note.txt"), "utf8")).toBe("x")
  })
})
