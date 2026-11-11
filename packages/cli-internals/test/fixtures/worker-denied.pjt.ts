import { Effect } from "effect"
import { BlueprintFileSystem } from "@projitect/core"
import { pjt } from "../../src/loader.js"

// Declares no permissions, then asks to read a file: the parent-side gate must refuse.
export default pjt({
  blueprints: [
    {
      id: "pjt:test:worker-denied",
      version: "1.0.0",
      permissions: [],
      plan: Effect.gen(function* () {
        const fs = yield* BlueprintFileSystem
        yield* fs.readFile("package.json")
        return { operations: [] }
      }),
    },
  ],
})
