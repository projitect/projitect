import { Effect } from "effect"
import { BlueprintFileSystem } from "@projitect/core"
import { describe, expect, it } from "vitest"
import { makeInMemoryLayer } from "../src/index.js"

const NON_UTF8 = new Uint8Array([0xff, 0xfe, 0x00, 0x80])

const run = <A, E>(
  initial: Readonly<Record<string, string>>,
  use: (fs: BlueprintFileSystem["Service"]) => Effect.Effect<A, E>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* use(yield* BlueprintFileSystem)
    }).pipe(Effect.provide(makeInMemoryLayer(initial))),
  )

describe("in-memory layer bytes", () => {
  it("round-trips non-UTF-8 bytes exactly", async () => {
    const out = await run({}, (f) =>
      Effect.gen(function* () {
        yield* f.writeFileBytes("asset.bin", NON_UTF8)
        return yield* f.readFileBytes("asset.bin")
      }),
    )
    expect(out).toEqual(NON_UTF8)
  })

  it("does not alias the buffers it was given or hands back", async () => {
    const input = new Uint8Array([1, 2, 3])
    const out = await run({}, (f) =>
      Effect.gen(function* () {
        yield* f.writeFileBytes("a.bin", input)
        yield* Effect.sync(() => input.fill(9))
        const first = yield* f.readFileBytes("a.bin")
        yield* Effect.sync(() => first.fill(9))
        return yield* f.readFileBytes("a.bin")
      }),
    )
    expect(out).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("fails to read bytes of a missing file with FsReadFailed", async () => {
    const err = await run({}, (f) => Effect.flip(f.readFileBytes("missing.bin")))
    expect(err.id).toBe("pjt.fs.read-failed")
  })

  it("keeps text and bytes views of one file consistent", async () => {
    const out = await run({ "a.txt": "héllo" }, (f) =>
      Effect.gen(function* () {
        const bytes = yield* f.readFileBytes("a.txt")
        yield* f.writeFileBytes("b.txt", bytes)
        return yield* f.readFile("b.txt")
      }),
    )
    expect(out).toBe("héllo")
  })

  it("preserves a leading byte-order mark through the text methods", async () => {
    const out = await run({}, (f) =>
      Effect.gen(function* () {
        yield* f.writeFile("bom.txt", "﻿hi")
        return yield* f.readFile("bom.txt")
      }),
    )
    expect(out).toBe("﻿hi")
  })
})
