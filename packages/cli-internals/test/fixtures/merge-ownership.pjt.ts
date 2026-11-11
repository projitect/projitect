import { Effect, Schema } from "effect"
import { BlueprintFileSystem, ChangeSet } from "@projitect/core"
import { pjt } from "../../src/loader.js"

const Spec = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    operations: Schema.Array(ChangeSet.Operation),
  }),
)

export default pjt({
  blueprints: Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const specs = Schema.decodeUnknownSync(Schema.fromJsonString(Spec))(
      yield* fs.readFile(".pjt-test-merge.json"),
    )
    return specs.map((spec) => ({
      id: spec.id,
      version: "1.0.0",
      permissions: [],
      plan: Effect.succeed({ operations: spec.operations }),
    }))
  }),
})
