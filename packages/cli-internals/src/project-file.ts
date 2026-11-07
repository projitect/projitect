import { Effect } from "effect"
import { BlueprintFileSystem } from "@projitect/core"

/**
 * Read a project-relative file through the `BlueprintFileSystem` service, treating any read
 * failure as "absent" (`null`). Shared by the lockfile, differ, applier and remover.
 */
export const readIfExists = (
  file: string,
): Effect.Effect<string | null, never, BlueprintFileSystem> =>
  Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    const present = yield* fs.exists(file)
    return present ? yield* fs.readFile(file) : null
  }).pipe(Effect.orElseSucceed(() => null))
