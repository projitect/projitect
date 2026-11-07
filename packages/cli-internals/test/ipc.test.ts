import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect, Exit, Layer } from "effect"
import { BlueprintFileSystem, Errors } from "@projitect/core"
import type { Permission } from "@projitect/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { makeRealLayer } from "../src/filesystem-impl.js"
import { makeClientLayer, makeInProcessPair, serve } from "../src/ipc/index.js"

const permissions: readonly Permission.Permission[] = [{ kind: "write", glob: "allowed/**" }]

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-ipc-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const direct = () => makeRealLayer({ blueprintId: "t", permissions, projectRoot: root })

const viaIpc = Layer.unwrap(
  Effect.gen(function* () {
    const shape = yield* Effect.provide(BlueprintFileSystem, direct())
    const [parent, child] = makeInProcessPair()
    serve(parent, shape)
    return makeClientLayer(child)
  }),
)

const run = <A, E>(
  layer: Layer.Layer<BlueprintFileSystem>,
  use: (f: BlueprintFileSystem["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.runPromiseExit(
    Effect.gen(function* () {
      return yield* use(yield* BlueprintFileSystem)
    }).pipe(Effect.provide(layer)),
  )

describe("BlueprintFileSystem over IPC", () => {
  it("round-trips every method", async () => {
    const exit = await run(viaIpc, (f) =>
      Effect.gen(function* () {
        yield* f.mkdir("allowed/dir")
        yield* f.writeFile("allowed/dir/a.txt", "hello")
        const text = yield* f.readFile("allowed/dir/a.txt")
        const there = yield* f.exists("allowed/dir/a.txt")
        const listed = yield* f.listDir("allowed/dir")
        yield* f.remove("allowed/dir/a.txt")
        const gone = yield* f.exists("allowed/dir/a.txt")
        return { text, there, listed, gone }
      }),
    )
    expect(exit).toEqual(
      Exit.succeed({ text: "hello", there: true, listed: ["a.txt"], gone: false }),
    )
  })

  it("matches direct results", async () => {
    const script = (f: BlueprintFileSystem["Service"]) =>
      Effect.gen(function* () {
        yield* f.writeFile("allowed/x.txt", "x")
        return yield* f.readFile("allowed/x.txt")
      })
    const a = await run(direct(), script)
    const b = await run(viaIpc, script)
    expect(b).toEqual(a)
  })

  it("keeps FsPermissionDenied class, id and fields", async () => {
    const exit = await run(viaIpc, (f) => Effect.flip(f.readFile("secret/x.txt")))
    const failure = Exit.isSuccess(exit) ? exit.value : undefined
    expect(failure).toBeInstanceOf(Errors.FsPermissionDenied)
    expect(failure).toMatchObject({
      id: "pjt.fs.permission-denied",
      path: "secret/x.txt",
      operation: "read",
      blueprintId: "t",
    })
  })

  it("keeps FsReadFailed", async () => {
    const exit = await run(viaIpc, (f) => Effect.flip(f.readFile("allowed/missing.txt")))
    const failure = Exit.isSuccess(exit) ? exit.value : undefined
    expect(failure).toBeInstanceOf(Errors.FsReadFailed)
    expect(failure).toMatchObject({ id: "pjt.fs.read-failed", path: "allowed/missing.txt" })
  })

  it("keeps FsWriteFailed", async () => {
    await fs.mkdir(path.join(root, "allowed", "d"), { recursive: true })
    await fs.writeFile(path.join(root, "allowed", "file"), "")
    const exit = await run(viaIpc, (f) => Effect.flip(f.mkdir("allowed/file/sub")))
    const failure = Exit.isSuccess(exit) ? exit.value : undefined
    expect(failure).toBeInstanceOf(Errors.FsWriteFailed)
    expect(failure).toMatchObject({ id: "pjt.fs.write-failed" })
  })
})
