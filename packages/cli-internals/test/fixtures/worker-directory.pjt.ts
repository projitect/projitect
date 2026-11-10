import { Effect } from "effect"
import { BlueprintFileSystem } from "@projitect/core"
import { directory } from "@projitect/blueprint"
import { pjt } from "../../src/loader.js"

// Reads `marker.txt`, then tries to climb out of its directory twice: through `..` and through a
// symlink (`escape`) that points at the project root. Both must be refused by the parent-side gate.
const reader = (id: string) => ({
  id,
  version: "1.0.0",
  permissions: [{ kind: "read" as const, glob: "**" }],
  plan: Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const marker = yield* fs.readFile("marker.txt")
    const refusal = (path: string) =>
      Effect.match(fs.readFile(path), { onFailure: (e) => e._tag, onSuccess: () => "read" })
    const climbed = yield* refusal("../marker.txt")
    const linked = yield* refusal("escape/marker.txt")
    return {
      operations: [
        {
          _tag: "Owned" as const,
          path: "report.json",
          ownerId: id,
          content: JSON.stringify({ marker, climbed, linked }),
        },
      ],
    }
  }),
})

export default pjt({
  blueprints: [directory("docs", [reader("pjt:test:worker-docs")])],
})
