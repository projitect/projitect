import { Effect } from "effect"
import { BlueprintFileSystem } from "@projitect/core"
import { pjt } from "../../src/loader.js"

// Reads a file holding a BOM and bytes that are not UTF-8, writes it back byte for byte, and
// tries the same read without the permission: the bytes must cross the worker boundary exactly.
const id = "pjt:test:worker-bytes"

export default pjt({
  blueprints: [
    {
      id,
      version: "1.0.0",
      permissions: [
        { kind: "read", glob: "raw.bin" },
        { kind: "write", glob: "copy.bin" },
      ],
      plan: Effect.gen(function* () {
        const fs = yield* BlueprintFileSystem
        const bytes = yield* fs.readFileBytes("raw.bin")
        yield* fs.writeFileBytes("copy.bin", bytes)
        const denied = yield* fs.readFileBytes("other.bin").pipe(
          Effect.match({
            onFailure: (error) => error._tag,
            onSuccess: () => "read",
          }),
        )
        return {
          operations: [
            {
              _tag: "Owned" as const,
              path: "report.json",
              ownerId: id,
              content: JSON.stringify({ bytes: Array.from(bytes), denied }),
            },
          ],
        }
      }),
    },
  ],
})
