import { Effect, Schema } from "effect"
import { ChangeSet, Permission } from "@projitect/core"
import { pjt } from "../../src/loader.js"

/**
 * Blueprints for the post-apply tests, described as JSON in `PJT_TEST_POST_APPLY` and decoded when
 * the tree is evaluated, so one static fixture serves every scenario.
 */
const Spec = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    permissions: Schema.Array(Permission.Permission),
    operations: Schema.Array(ChangeSet.Operation),
  }),
)

export default pjt({
  // An Effect tree is evaluated on every load, so each test's env is read fresh despite module caching.
  blueprints: Effect.sync(() =>
    Schema.decodeUnknownSync(Spec)(JSON.parse(process.env["PJT_TEST_POST_APPLY"] ?? "[]")).map(
      (spec) => ({
        id: spec.id,
        version: "1.0.0",
        permissions: spec.permissions,
        plan: Effect.succeed({ operations: spec.operations }),
      }),
    ),
  ),
})
