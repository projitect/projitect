import { Schema } from "effect"

/**
 * Every projitect error declares a semantic `id` (e.g. `pjt.fs.permission-denied`). The CLI prints
 * the id + URL when an error reaches the terminal; `pjt explain <id>` opens the local docs page;
 * `apps/website/check:errors` fails CI if any id lacks a docs entry.
 *
 * Errors use `Schema.TaggedError` so they serialize cleanly into the `--json` output mode.
 */

// ---------------------------------------------------------------------------
// Filesystem errors
// ---------------------------------------------------------------------------

export class FsPermissionDenied extends Schema.TaggedError<FsPermissionDenied>()(
  "FsPermissionDenied",
  {
    id: Schema.Literal("pjt.fs.permission-denied"),
    path: Schema.String,
    operation: Schema.Literals([
      "read",
      "write",
      "exists",
      "remove",
      "removeEmptyDir",
      "mkdir",
      "listDir",
    ]),
    blueprintId: Schema.String,
    message: Schema.String,
  },
) {}

export class FsReadFailed extends Schema.TaggedError<FsReadFailed>()("FsReadFailed", {
  id: Schema.Literal("pjt.fs.read-failed"),
  path: Schema.String,
  cause: Schema.String,
  message: Schema.String,
}) {}

export class FsWriteFailed extends Schema.TaggedError<FsWriteFailed>()("FsWriteFailed", {
  id: Schema.Literal("pjt.fs.write-failed"),
  path: Schema.String,
  cause: Schema.String,
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Loader errors — when the user's `.pjt.ts` can't be parsed or doesn't export a valid default
// ---------------------------------------------------------------------------

export class LoaderImportFailed extends Schema.TaggedError<LoaderImportFailed>()(
  "LoaderImportFailed",
  {
    id: Schema.Literal("pjt.loader.import-failed"),
    blueprintFile: Schema.String,
    cause: Schema.String,
    message: Schema.String,
  },
) {}

export class LoaderInvalidDefaultExport extends Schema.TaggedError<LoaderInvalidDefaultExport>()(
  "LoaderInvalidDefaultExport",
  {
    id: Schema.Literal("pjt.loader.invalid-default-export"),
    blueprintFile: Schema.String,
    received: Schema.String,
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Config errors
// ---------------------------------------------------------------------------

export class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()("ConfigInvalid", {
  id: Schema.Literal("pjt.config.invalid"),
  source: Schema.Literals(["defaults", "env", "blueprintFile", "cliArgs"]),
  field: Schema.String,
  message: Schema.String,
}) {}

export class ConfigBlueprintFileNotFound extends Schema.TaggedError<ConfigBlueprintFileNotFound>()(
  "ConfigBlueprintFileNotFound",
  {
    id: Schema.Literal("pjt.config.blueprint-file-not-found"),
    blueprintFile: Schema.String,
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Plan errors — surfaced when reducing the blueprint tree into a project plan
// ---------------------------------------------------------------------------

export class PlanConflictRegion extends Schema.TaggedError<PlanConflictRegion>()(
  "PlanConflictRegion",
  {
    id: Schema.Literal("pjt.plan.conflict-region"),
    path: Schema.String,
    ownerA: Schema.String,
    ownerB: Schema.String,
    message: Schema.String,
  },
) {}

export class PlanConflictMerge extends Schema.TaggedError<PlanConflictMerge>()(
  "PlanConflictMerge",
  {
    id: Schema.Literal("pjt.plan.conflict-merge"),
    path: Schema.String,
    key: Schema.String,
    ownerA: Schema.String,
    ownerB: Schema.String,
    message: Schema.String,
  },
) {}

export class PlanConflictOwned extends Schema.TaggedError<PlanConflictOwned>()(
  "PlanConflictOwned",
  {
    id: Schema.Literal("pjt.plan.conflict-owned"),
    path: Schema.String,
    ownerA: Schema.String,
    ownerB: Schema.String,
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Skills errors — a skill name, target root or file path failed validation
// ---------------------------------------------------------------------------

export class SkillInvalid extends Schema.TaggedError<SkillInvalid>()("SkillInvalid", {
  id: Schema.Literal("pjt.skills.invalid-path"),
  field: Schema.Literals(["target", "name", "path", "skill", "id", "version"]),
  value: Schema.String,
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// React errors — a `react()` option failed validation
// ---------------------------------------------------------------------------

export class ReactInvalid extends Schema.TaggedError<ReactInvalid>()("ReactInvalid", {
  id: Schema.Literal("pjt.react.invalid-options"),
  field: Schema.Literals(["template", "name"]),
  value: Schema.String,
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Region marker errors — encountered when reading existing file content
// ---------------------------------------------------------------------------

export class RegionMissingEnd extends Schema.TaggedError<RegionMissingEnd>()("RegionMissingEnd", {
  id: Schema.Literal("pjt.region.missing-end"),
  path: Schema.String,
  ownerId: Schema.String,
  startLine: Schema.Number,
  message: Schema.String,
}) {}

export class RegionDuplicate extends Schema.TaggedError<RegionDuplicate>()("RegionDuplicate", {
  id: Schema.Literal("pjt.region.duplicate"),
  path: Schema.String,
  ownerId: Schema.String,
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Apply / init errors
// ---------------------------------------------------------------------------

export class ApplyDirtyGit extends Schema.TaggedError<ApplyDirtyGit>()("ApplyDirtyGit", {
  id: Schema.Literal("pjt.apply.dirty-git"),
  command: Schema.Literals(["build", "remodel"]),
  message: Schema.String,
}) {}

export class InitGitMissing extends Schema.TaggedError<InitGitMissing>()("InitGitMissing", {
  id: Schema.Literal("pjt.init.git-missing"),
  message: Schema.String,
}) {}

export class InitPackageJsonMissing extends Schema.TaggedError<InitPackageJsonMissing>()(
  "InitPackageJsonMissing",
  {
    id: Schema.Literal("pjt.init.package-json-missing"),
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Drift — not an error class in the throwing sense, but reported via inspect's nonzero exit
// ---------------------------------------------------------------------------

export class DriftDetected extends Schema.TaggedError<DriftDetected>()("DriftDetected", {
  id: Schema.Literal("pjt.drift.detected"),
  affectedPaths: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Package-manager errors (used by `pjt add`)
// ---------------------------------------------------------------------------

export class PmNotDetected extends Schema.TaggedError<PmNotDetected>()("PmNotDetected", {
  id: Schema.Literal("pjt.pm.not-detected"),
  projectRoot: Schema.String,
  message: Schema.String,
}) {}

export class PmInstallFailed extends Schema.TaggedError<PmInstallFailed>()("PmInstallFailed", {
  id: Schema.Literal("pjt.pm.install-failed"),
  packageManager: Schema.String,
  pkg: Schema.String,
  cause: Schema.String,
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// `pjt add` errors
// ---------------------------------------------------------------------------

export class AddMarkersMissing extends Schema.TaggedError<AddMarkersMissing>()(
  "AddMarkersMissing",
  {
    id: Schema.Literal("pjt.add.markers-missing"),
    blueprintFile: Schema.String,
    missingMarker: Schema.String,
    message: Schema.String,
  },
) {}

export class AddMetadataMissing extends Schema.TaggedError<AddMetadataMissing>()(
  "AddMetadataMissing",
  {
    id: Schema.Literal("pjt.add.metadata-missing"),
    pkg: Schema.String,
    blueprintFile: Schema.String,
    message: Schema.String,
  },
) {}

export class AddSpecUnsupported extends Schema.TaggedError<AddSpecUnsupported>()(
  "AddSpecUnsupported",
  {
    id: Schema.Literal("pjt.add.spec-unsupported"),
    spec: Schema.String,
    reason: Schema.Literals(["empty", "unsafe-name", "alias", "url", "file", "git", "workspace"]),
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Git errors
// ---------------------------------------------------------------------------

export class GitNotARepo extends Schema.TaggedError<GitNotARepo>()("GitNotARepo", {
  id: Schema.Literal("pjt.git.not-a-repo"),
  projectRoot: Schema.String,
  message: Schema.String,
}) {}

export class GitCommandFailed extends Schema.TaggedError<GitCommandFailed>()("GitCommandFailed", {
  id: Schema.Literal("pjt.git.command-failed"),
  command: Schema.String,
  cause: Schema.String,
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Exec errors
// ---------------------------------------------------------------------------

export class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  id: Schema.Literal("pjt.exec.command-failed"),
  command: Schema.String,
  exitCode: Schema.optional(Schema.Number),
  stdout: Schema.String,
  stderr: Schema.String,
  cause: Schema.optional(Schema.String),
  message: Schema.String,
}) {}

export class CommandNotPermitted extends Schema.TaggedError<CommandNotPermitted>()(
  "CommandNotPermitted",
  {
    id: Schema.Literal("pjt.exec.command-not-permitted"),
    command: Schema.String,
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Lockfile errors
// ---------------------------------------------------------------------------

export class LockParseFailed extends Schema.TaggedError<LockParseFailed>()("LockParseFailed", {
  id: Schema.Literal("pjt.lock.parse-failed"),
  path: Schema.String,
  cause: Schema.String,
  message: Schema.String,
}) {}

export class LockVersionMismatch extends Schema.TaggedError<LockVersionMismatch>()(
  "LockVersionMismatch",
  {
    id: Schema.Literal("pjt.lock.version-mismatch"),
    found: Schema.Number,
    expected: Schema.Number,
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Worker errors — a confined blueprint worker process failed to deliver a result
// ---------------------------------------------------------------------------

export class WorkerCrashed extends Schema.TaggedError<WorkerCrashed>()("WorkerCrashed", {
  id: Schema.Literal("pjt.worker.crashed"),
  exitCode: Schema.optional(Schema.Number),
  signal: Schema.optional(Schema.String),
  message: Schema.String,
}) {}

export class WorkerTimedOut extends Schema.TaggedError<WorkerTimedOut>()("WorkerTimedOut", {
  id: Schema.Literal("pjt.worker.timed-out"),
  timeoutMs: Schema.Number,
  message: Schema.String,
}) {}

export class WorkerExitedEarly extends Schema.TaggedError<WorkerExitedEarly>()(
  "WorkerExitedEarly",
  {
    id: Schema.Literal("pjt.worker.exited-early"),
    exitCode: Schema.optional(Schema.Number),
    signal: Schema.optional(Schema.String),
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Union of every error a Blueprint's `plan` Effect or the CLI engine can produce
// ---------------------------------------------------------------------------

export type BlueprintError =
  | FsPermissionDenied
  | FsReadFailed
  | FsWriteFailed
  | RegionMissingEnd
  | RegionDuplicate
  | SkillInvalid
  | ReactInvalid

export type LoaderError = LoaderImportFailed | LoaderInvalidDefaultExport

export type ConfigError = ConfigInvalid | ConfigBlueprintFileNotFound

export type PlanError = PlanConflictRegion | PlanConflictMerge | PlanConflictOwned

export type ApplyError = ApplyDirtyGit

export type InitError = InitGitMissing | InitPackageJsonMissing

export type LockError = LockParseFailed | LockVersionMismatch

export type GitError = GitNotARepo | GitCommandFailed

export type ExecError = CommandFailed | CommandNotPermitted

export type PmError = PmNotDetected | PmInstallFailed

export type AddError = AddMarkersMissing | AddMetadataMissing | AddSpecUnsupported

export type WorkerError = WorkerCrashed | WorkerTimedOut | WorkerExitedEarly

export type ProjitectError =
  | BlueprintError
  | LoaderError
  | ConfigError
  | PlanError
  | ApplyError
  | InitError
  | LockError
  | GitError
  | ExecError
  | PmError
  | AddError
  | WorkerError
  | DriftDetected

/**
 * Machine-readable manifest of every error id this build defines. Consumed by
 * `apps/website` to generate `/errors/<id>` pages and by `pjt explain <id>` to look up the
 * matching docs URL. Adding a new error class without adding it here is a tc error because the
 * literal must match the class' `id` field schema.
 */
export const ERROR_IDS = [
  "pjt.fs.permission-denied",
  "pjt.fs.read-failed",
  "pjt.fs.write-failed",
  "pjt.loader.import-failed",
  "pjt.loader.invalid-default-export",
  "pjt.config.invalid",
  "pjt.config.blueprint-file-not-found",
  "pjt.plan.conflict-region",
  "pjt.plan.conflict-merge",
  "pjt.plan.conflict-owned",
  "pjt.skills.invalid-path",
  "pjt.react.invalid-options",
  "pjt.region.missing-end",
  "pjt.region.duplicate",
  "pjt.apply.dirty-git",
  "pjt.init.git-missing",
  "pjt.init.package-json-missing",
  "pjt.drift.detected",
  "pjt.lock.parse-failed",
  "pjt.lock.version-mismatch",
  "pjt.git.not-a-repo",
  "pjt.git.command-failed",
  "pjt.exec.command-failed",
  "pjt.exec.command-not-permitted",
  "pjt.pm.not-detected",
  "pjt.pm.install-failed",
  "pjt.add.markers-missing",
  "pjt.add.metadata-missing",
  "pjt.add.spec-unsupported",
  "pjt.worker.crashed",
  "pjt.worker.timed-out",
  "pjt.worker.exited-early",
] as const

export type ErrorId = (typeof ERROR_IDS)[number]

export const docsUrl = (id: ErrorId): string => `https://projitect.dev/errors/${id}`
