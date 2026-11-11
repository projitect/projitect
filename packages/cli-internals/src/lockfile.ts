import { Effect, Schema } from "effect"
import { BlueprintFileSystem, Errors, PjtLock } from "@projitect/core"
import { readIfExists } from "./project-file.js"

const LOCKFILE_NAME = ".pjt.lock"
const CURRENT_VERSION = 3 as const

/**
 * Read `.pjt.lock` from the project root of the provided `BlueprintFileSystem`. Returns `null` if the file doesn't exist (fresh project).
 * Reads v1, v2 and v3 lockfiles. Fails with `pjt.lock.parse-failed` on JSON or schema errors,
 * `pjt.lock.version-mismatch` if the lockfile was written by a newer projitect.
 */
export const readLockfile: Effect.Effect<
  PjtLock.PjtLock | null,
  Errors.LockParseFailed | Errors.LockVersionMismatch,
  BlueprintFileSystem
> = Effect.gen(function* () {
  const file = LOCKFILE_NAME
  const raw = yield* readIfExists(file)
  if (raw === null) {
    return null
  }

  const parsed = yield* Effect.try({
    try: () => JSON.parse(raw) as unknown,
    catch: (e) =>
      new Errors.LockParseFailed({
        id: "pjt.lock.parse-failed",
        path: file,
        cause: e instanceof Error ? e.message : String(e),
        message: `Could not parse ${LOCKFILE_NAME}. The file is corrupted — delete it and rerun \`pjt remodel\` to rebuild.`,
      }),
  })

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "number" &&
    parsed.version > CURRENT_VERSION
  ) {
    return yield* new Errors.LockVersionMismatch({
      id: "pjt.lock.version-mismatch",
      found: parsed.version,
      expected: CURRENT_VERSION,
      message: `${LOCKFILE_NAME} was written by a newer projitect (version ${parsed.version}). Upgrade the \`projitect\` devDep.`,
    })
  }

  return yield* Schema.decodeUnknownEffect(PjtLock.PjtLock)(parsed).pipe(
    Effect.mapError(
      (e) =>
        new Errors.LockParseFailed({
          id: "pjt.lock.parse-failed",
          path: file,
          cause: String(e),
          message: `${LOCKFILE_NAME} does not match the expected schema. Delete it and rerun \`pjt remodel\` to rebuild.`,
        }),
    ),
  )
})

/**
 * Write `.pjt.lock` through the provided `BlueprintFileSystem`. Always writes the current schema
 * version (v3): a v1 or v2 lock is migrated by stamping the version, and every operation — with its
 * optional `commentSuffix`, `ownedDir`, `contentHash` and `writtenPaths` — is written unchanged.
 */
export const writeLockfile = (params: {
  readonly lock: PjtLock.PjtLock
}): Effect.Effect<void, Errors.FsWriteFailed | Errors.FsPermissionDenied, BlueprintFileSystem> =>
  Effect.gen(function* () {
    const fs = yield* BlueprintFileSystem
    yield* fs.writeFile(
      LOCKFILE_NAME,
      `${JSON.stringify({ ...params.lock, version: CURRENT_VERSION }, null, 2)}\n`,
    )
  })

/**
 * Build the set of blueprint ids currently expected to be present from a lockfile. Used by the
 * planner to compute which blueprints have left the tree (their ops will be turned into
 * removals on next apply).
 */
export const blueprintIds = (lock: PjtLock.PjtLock | null): ReadonlySet<string> =>
  new Set(lock === null ? [] : Object.keys(lock.blueprints))
