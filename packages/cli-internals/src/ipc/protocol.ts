import { Schema } from "effect"
import { Errors } from "@projitect/core"

/**
 * Wire frames for marshalling `BlueprintFileSystem` calls across a process boundary. Every frame
 * carries a correlation `id`; one request form exists per service method. Failures travel as the
 * existing `Schema.TaggedError` classes, so class, id and fields survive the round trip.
 */

export const Request = Schema.Union([
  Schema.TaggedStruct("ReadFile", { id: Schema.Number, path: Schema.String }),
  Schema.TaggedStruct("WriteFile", {
    id: Schema.Number,
    path: Schema.String,
    content: Schema.String,
  }),
  Schema.TaggedStruct("Exists", { id: Schema.Number, path: Schema.String }),
  Schema.TaggedStruct("Remove", { id: Schema.Number, path: Schema.String }),
  Schema.TaggedStruct("RemoveEmptyDir", { id: Schema.Number, path: Schema.String }),
  Schema.TaggedStruct("Mkdir", { id: Schema.Number, path: Schema.String }),
  Schema.TaggedStruct("ListDir", { id: Schema.Number, path: Schema.String }),
])
export type Request = typeof Request.Type

export const FsError = Schema.Union([
  Errors.FsPermissionDenied,
  Errors.FsReadFailed,
  Errors.FsWriteFailed,
])
export type FsError = typeof FsError.Type

export const Response = Schema.Union([
  Schema.TaggedStruct("ReadFileOk", { id: Schema.Number, value: Schema.String }),
  Schema.TaggedStruct("WriteFileOk", { id: Schema.Number }),
  Schema.TaggedStruct("ExistsOk", { id: Schema.Number, value: Schema.Boolean }),
  Schema.TaggedStruct("RemoveOk", { id: Schema.Number }),
  Schema.TaggedStruct("RemoveEmptyDirOk", { id: Schema.Number }),
  Schema.TaggedStruct("MkdirOk", { id: Schema.Number }),
  Schema.TaggedStruct("ListDirOk", { id: Schema.Number, value: Schema.Array(Schema.String) }),
  Schema.TaggedStruct("Failure", { id: Schema.Number, error: FsError }),
])
export type Response = typeof Response.Type

/** Frames cross the transport in their encoded (JSON-compatible) form. */
export const encodeRequest = Schema.encodeEffect(Request)
export const decodeRequest = Schema.decodeUnknownEffect(Request)
export const encodeResponse = Schema.encodeEffect(Response)
export const decodeResponse = Schema.decodeUnknownEffect(Response)
