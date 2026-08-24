import { Effect, FileSystem } from "effect"
import { describe, expect, it, vi } from "vitest"
import { FileSystemLive } from "../src/platform/file-system.js"

const mocks = vi.hoisted(() => ({ glob: vi.fn() }))

vi.mock("node:fs/promises", () => ({ glob: mocks.glob }))

describe("FileSystemLive.glob errors", () => {
  it("translates Node glob failures into platform errors", async () => {
    mocks.glob.mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" })),
      }),
    })

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        return yield* fileSystem.glob("**/*.ts")
      }).pipe(Effect.provide(FileSystemLive), Effect.flip),
    )

    expect(error).toMatchObject({
      _tag: "PlatformError",
      reason: {
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "glob",
      },
    })
  })
})
