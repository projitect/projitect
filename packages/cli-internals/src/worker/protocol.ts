import { Schema } from "effect"
import { ChangeSet, Errors, Permission } from "@projitect/core"

/**
 * Messages on the fork channel between the CLI (parent) and the confined worker (child). The
 * `BlueprintFileSystem` frames from `ipc/protocol.ts` ride inside `Fs` messages, tagged with the
 * `scope` of the blueprint they belong to, so one channel serves the config-time Effect and every
 * blueprint's plan.
 */

/** Parent → child: which module to run. `blueprintFile` is the user-facing name for error messages. */
const ToChild = Schema.Union([
  Schema.TaggedStruct("Start", {
    modulePath: Schema.String,
    blueprintFile: Schema.String,
  }),
  Schema.TaggedStruct("Fs", { scope: Schema.Number, frame: Schema.Unknown }),
])

/** What a blueprint's plan, the loader or the config-time Effect can fail with inside the child. */
export const ChildError = Schema.Union([
  Errors.FsPermissionDenied,
  Errors.FsReadFailed,
  Errors.FsWriteFailed,
  Errors.RegionMissingEnd,
  Errors.RegionDuplicate,
  Errors.LoaderImportFailed,
  Errors.LoaderInvalidDefaultExport,
  Errors.SkillInvalid,
])
export type ChildError = typeof ChildError.Type

/** One flattened blueprint with its planned operations — plain data, safe to cross the boundary. */
export const PlannedBlueprint = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  permissions: Schema.Array(Permission.Permission),
  directoryPrefix: Schema.String,
  changeSet: ChangeSet.ChangeSet,
})
export type PlannedBlueprint = typeof PlannedBlueprint.Type

/** Child → parent. `Open` announces a blueprint's id and permissions before its first `Fs` frame. */
export const FromChild = Schema.Union([
  Schema.TaggedStruct("Open", {
    scope: Schema.Number,
    blueprintId: Schema.String,
    permissions: Schema.Array(Permission.Permission),
  }),
  Schema.TaggedStruct("Fs", { scope: Schema.Number, frame: Schema.Unknown }),
  Schema.TaggedStruct("Planned", { blueprints: Schema.Array(PlannedBlueprint) }),
  Schema.TaggedStruct("Failed", { error: ChildError }),
  Schema.TaggedStruct("Defect", { message: Schema.String }),
])
export type FromChild = typeof FromChild.Type

export const encodeToChild = Schema.encodeEffect(ToChild)
export const decodeToChild = Schema.decodeUnknownEffect(ToChild)
export const encodeFromChild = Schema.encodeEffect(FromChild)
export const decodeFromChild = Schema.decodeUnknownEffect(FromChild)
