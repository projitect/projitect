import { Context } from "effect"
import type { Effect } from "effect"
import type { FsPermissionDenied, FsReadFailed, FsWriteFailed } from "./errors/index.js"

/**
 * The sandboxed file system blueprints receive. The real `@effect/platform` `FileSystem` is
 * never provided to blueprint code — `cli-internals` wires a permission-gated implementation
 * here.
 *
 * The interface lives in `@projitect/core` so it can be referenced from both `@projitect/blueprint`
 * (which exposes helpers built on it) and `@projitect/cli-internals` (which implements it).
 *
 * The current implementation is a soft sandbox: it enforces permissions at the Effect layer but
 * runs in the same process as the CLI. A worker-process implementation is a tracked v2 follow-up;
 * the interface is shaped so the swap is transparent to blueprint authors.
 */
export interface BlueprintFileSystemShape {
  readonly readFile: (path: string) => Effect.Effect<string, FsReadFailed | FsPermissionDenied>
  readonly writeFile: (
    path: string,
    content: string,
  ) => Effect.Effect<void, FsWriteFailed | FsPermissionDenied>
  /** Read a file as raw bytes, with no text decoding. Needs the same permission as `readFile`. */
  readonly readFileBytes: (
    path: string,
  ) => Effect.Effect<Uint8Array, FsReadFailed | FsPermissionDenied>
  /** Write raw bytes, with no text encoding. Needs the same permission as `writeFile`. */
  readonly writeFileBytes: (
    path: string,
    bytes: Uint8Array,
  ) => Effect.Effect<void, FsWriteFailed | FsPermissionDenied>
  readonly exists: (path: string) => Effect.Effect<boolean, FsPermissionDenied>
  readonly remove: (path: string) => Effect.Effect<void, FsWriteFailed | FsPermissionDenied>
  /**
   * Remove a directory only if it is empty — never recursive. Fails with `FsWriteFailed` when the
   * directory is missing or holds any entry, so an entry that appears concurrently survives.
   */
  readonly removeEmptyDir: (path: string) => Effect.Effect<void, FsWriteFailed | FsPermissionDenied>
  readonly mkdir: (path: string) => Effect.Effect<void, FsWriteFailed | FsPermissionDenied>
  readonly listDir: (
    path: string,
  ) => Effect.Effect<readonly string[], FsReadFailed | FsPermissionDenied>
}

export class BlueprintFileSystem extends Context.Service<
  BlueprintFileSystem,
  BlueprintFileSystemShape
>()("@projitect/core/BlueprintFileSystem") {}
