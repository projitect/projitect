import { Effect } from "effect"
import { BlueprintFileSystem } from "@projitect/core"
import { directory } from "@projitect/blueprint"
import { pjt } from "../../src/loader.js"

export default pjt({
  blueprints: [
    directory("..", [
      {
        id: "pjt:test:worker-directory-escape",
        version: "1.0.0",
        permissions: [{ kind: "read", glob: "**" }],
        plan: Effect.gen(function* () {
          const fs = yield* BlueprintFileSystem
          yield* fs.readFile("marker.txt")
          return { operations: [] }
        }),
      },
    ]),
  ],
})
