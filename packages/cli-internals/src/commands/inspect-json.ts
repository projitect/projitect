import { Schema } from "effect"
import { PjtLock } from "@projitect/core"

/**
 * Versioned URL for the published `pjt inspect --json` contract. Doubles as the `$id` of the
 * generated JSON Schema document and the `$schema` value every `--json` output carries. Bumps to
 * `inspect.v2.json` only on a breaking change to the output shape, shipped in a major release.
 */
export const InspectJsonSchemaUrl = "https://projitect.dev/schemas/inspect.v1.json"

/**
 * Effect Schema for the `pjt inspect --json` output. `renderInspectJson` encodes through this so
 * the TypeScript types it's built from (`FileDiff`, `UpgradeRecord`, `PjtLock.LockOperation`) are
 * checked against it at compile time, and the published JSON Schema file is generated from this
 * same definition — it can't drift from the code that produces the output.
 */
export const InspectJson = Schema.Struct({
  $schema: Schema.Literal(InspectJsonSchemaUrl).annotate({
    description: "Identifies the published JSON Schema this output conforms to.",
  }),
  hasDrift: Schema.Boolean.annotate({
    description: "Whether the project has drifted from its blueprints or lockfile.",
  }),
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      status: Schema.Literals(["create", "modify", "ok"]).annotate({
        description:
          '"create" — file absent, will be created; "modify" — exists but content drifts; "ok" — in sync.',
      }),
      summary: Schema.String,
    }),
  ).annotate({ description: "Per-file drift status, one entry per managed file." }),
  removals: Schema.Array(PjtLock.LockOperation).annotate({
    description: "Operations recorded in the lockfile whose owning blueprint has left the tree.",
  }),
  upgrades: Schema.Array(
    Schema.Struct({
      blueprintId: Schema.String,
      from: Schema.String,
      to: Schema.String,
    }),
  ).annotate({
    description: "Blueprints whose locked version differs from the tree's current version.",
  }),
}).annotate({
  title: "pjt inspect --json output",
  description:
    "Structured drift report for `pjt inspect --json`. New keys may be added within this version; removing or renaming a key requires a new schema version.",
})

export type InspectJson = typeof InspectJson.Type

/**
 * The published schema file's contents — generated from {@link InspectJson}, never hand-edited.
 * `additionalProperties: true` keeps the documented promise that new keys may be added within a
 * version without breaking consumers.
 */
export const inspectJsonSchemaDocument = (): Record<string, unknown> => {
  const doc = Schema.toJsonSchemaDocument(InspectJson, { additionalProperties: true })
  const hasDefinitions = Object.keys(doc.definitions).length > 0
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: InspectJsonSchemaUrl,
    ...doc.schema,
    ...(hasDefinitions ? { $defs: doc.definitions } : {}),
  }
}
