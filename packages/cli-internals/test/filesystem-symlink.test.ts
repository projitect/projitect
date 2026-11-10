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
) =>
  Effect.runPromiseExit(
    Effect.gen(function* () {
      return yield* use(yield* BlueprintFileSystem)
    }).pipe(Effect.provide(makeRealLayer({ blueprintId: "t", permissions: perms, projectRoot }))),
  )

describe("byte methods", () => {
  const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80])
  const writeOnly: readonly Permission.Permission[] = [{ kind: "write", glob: "granted/**" }]
  const readOnly: readonly Permission.Permission[] = [{ kind: "read", glob: "real/**" }]

  it("round-trips non-UTF-8 bytes exactly on disk", async () => {
    const exit = await run(root, (f) =>
      Effect.gen(function* () {
        yield* f.writeFileBytes("real/asset.bin", bytes)
        return yield* f.readFileBytes("real/asset.bin")
      }),
    )
    expect(exit).toEqual(Exit.succeed(bytes))
    expect(new Uint8Array(await fs.readFile(path.join(root, "real", "asset.bin")))).toEqual(bytes)
  })

  it("denies a byte read outside the granted globs", async () => {
    const exit = await run(root, (f) => f.readFileBytes("real/ok.txt"), writeOnly)
    expect(JSON.stringify(exit)).toContain("pjt.fs.permission-denied")
  })

  it("denies a byte write outside the granted globs", async () => {
    const exit = await run(root, (f) => f.writeFileBytes("real/new.bin", bytes), writeOnly)
    expect(JSON.stringify(exit)).toContain("pjt.fs.permission-denied")
    await expect(fs.lstat(path.join(root, "real", "new.bin"))).rejects.toThrow()
  })

  it("denies a byte write under a read-only permission, and allows the byte read", async () => {
    const written = await run(root, (f) => f.writeFileBytes("real/new.bin", bytes), readOnly)
    expect(JSON.stringify(written)).toContain("pjt.fs.permission-denied")
    const read = await run(root, (f) => f.readFileBytes("real/ok.txt"), readOnly)
    expect(read).toEqual(Exit.succeed(new TextEncoder().encode("ok")))
  })
})

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
