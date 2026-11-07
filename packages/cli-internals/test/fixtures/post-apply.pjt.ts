import { Effect, Schema } from "effect"
import { BlueprintFileSystem, ChangeSet, Permission } from "@projitect/core"
import { pjt } from "../../src/loader.js"

/**
 * Blueprints for the post-apply tests, described as JSON under the `pjtTestPostApply` key of the
 * project's `package.json` (the confined worker has an empty environment, and `package.json`
 * survives `pjt build --force`), so one static fixture serves every scenario.
 */
const Spec = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    permissions: Schema.Array(Permission.Permission),
    operations: Schema.Array(ChangeSet.Operation),
  }),
)

const Manifest = Schema.Struct({ pjtTestPostApply: Spec })

export default pjt({
  blueprints: Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const manifest = Schema.decodeUnknownSync(Manifest)(
      JSON.parse(yield* fs.readFile("package.json")),
    )
    return manifest.pjtTestPostApply.map((spec) => ({
      id: spec.id,
      version: "1.0.0",
      permissions: spec.permissions,
      plan: Effect.succeed({ operations: spec.operations }),
    }))
  }),
})
