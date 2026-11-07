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
 * Blueprint code runs in a permission-restricted child process; there this service is a client
 * that forwards every call to the CLI, which enforces the declared permissions.
 */
export interface BlueprintFileSystemShape {
  readonly readFile: (path: string) => Effect.Effect<string, FsReadFailed | FsPermissionDenied>
  readonly writeFile: (
    path: string,
    content: string,
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
