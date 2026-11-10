import { Effect, Option, Schema } from "effect"
import { Errors } from "@projitect/core"
import type { ProjitectConfig } from "@projitect/core"
import { loadProjectPlan } from "./load-plan.js"

const ErrorId = Schema.Literals(Errors.ERROR_IDS)

/**
 * `pjt explain <id>` — print a short description of an error id, with a link to the docs page.
 * The full content lives on the marketing site at `/errors/<id>`; this CLI gives the basics
 * without a network call.
 */
export const explain = (params: { readonly errorId: string }): Effect.Effect<string> =>
  Effect.sync(() =>
    Option.match(Schema.decodeUnknownOption(ErrorId)(params.errorId), {
      onNone: () =>
        `Unknown error id: ${params.errorId}\nSee https://projitect.dev/errors for the full registry.`,
      onSome: (id) => `${id}\n${ERROR_BLURBS[id]}\nMore at: ${Errors.docsUrl(id)}`,
    }),
  )

/**
 * `pjt explain` with no id — list the project's post-apply commands: for each, the owning
 * blueprint, the fix command (run by `build` and `remodel`) and the check command (run by
 * `inspect`, if any). Every declaration is listed, even when several share a fix, so no owner or check is hidden. With `json`, the
 * same entries as a JSON object under a `commands` key.
 */
export const explainCommands = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly json: boolean
}): Effect.Effect<string, Errors.ProjitectError> =>
  Effect.gen(function* () {
    const { plan } = yield* loadProjectPlan(params.config)
    const commands = plan.commands.map((planned) => ({
      ownerId: planned.ownerId,
      fix: planned.command,
      ...(planned.check === undefined ? {} : { check: planned.check }),
    }))
    if (params.json) {
      return `${JSON.stringify({ commands }, null, 2)}\n`.trimEnd()
    }
    if (commands.length === 0) {
      return "No blueprint declares post-apply commands."
    }
    return commands
      .map(
        (c) =>
          `${c.ownerId}\n  fix:   ${c.fix}\n  check: ${c.check ?? "(none; `pjt inspect` does not run this command)"}`,
      )
      .join("\n")
  })

const ERROR_BLURBS: Readonly<Record<Errors.ErrorId, string>> = {
  "pjt.fs.permission-denied":
    "A blueprint attempted a filesystem operation outside its declared permissions. Check the blueprint's `permissions` array.",
  "pjt.fs.read-failed":
    "A read operation failed at the OS level (typically ENOENT or EACCES). The cause is printed alongside.",
  "pjt.fs.write-failed":
    "A write operation failed at the OS level. The cause is printed alongside.",
  "pjt.loader.import-failed":
    "The `.pjt.ts` file could not be imported. Check for syntax errors or missing dependencies.",
  "pjt.loader.invalid-default-export":
    "`.pjt.ts` must `export default pjt({...})`. Found a different shape.",
  "pjt.config.invalid":
    "A config value failed schema validation. The offending field and source layer are reported.",
  "pjt.config.blueprint-file-not-found":
    "No `.pjt.ts` at the project root. Run `pjt init` to create one.",
  "pjt.plan.conflict-region":
    "Two blueprints share the same `ownerId` for a region in the same file. Pick distinct ids.",
  "pjt.plan.conflict-merge":
    "Two blueprints claim the same JSON key in the same file. Coordinate ownership.",
  "pjt.plan.conflict-owned":
    "Two blueprints both claim full ownership of one file. Only one `ownFile` per path is allowed.",
  "pjt.skills.invalid-path":
    "A skill name, target root or file path is empty, absolute, or tries to leave the skills directory — or a skill has no `SKILL.md`.",
  "pjt.region.missing-end":
    "A region start marker was found without a matching end marker. The file has been hand-edited and the closing marker removed.",
  "pjt.region.duplicate": "Multiple start markers for the same region in one file. Hand-edited?",
  "pjt.apply.dirty-git":
    "`build` requires a clean git working tree. Commit or stash first, then retry.",
  "pjt.init.git-missing":
    "`pjt init` requires a git repository. Run `git init` first, or rerun with --yes.",
  "pjt.init.package-json-missing":
    "`pjt init` requires a `package.json`. Run `npm init -y` first, or rerun with --yes.",
  "pjt.drift.detected":
    "`pjt inspect` exits nonzero when the project drifts from its blueprints. Run `pjt remodel` to sync.",
  "pjt.lock.parse-failed":
    "`.pjt.lock` is corrupted or doesn't match the expected schema. Delete it and rerun `pjt remodel` to rebuild.",
  "pjt.lock.version-mismatch":
    "`.pjt.lock` was written by a newer projitect than the one currently installed. Upgrade the `projitect` devDep.",
  "pjt.git.not-a-repo": "Required a git repository, but `.git/` was missing. Run `git init` first.",
  "pjt.git.command-failed":
    "A `git` command exited non-zero or git isn't installed. The underlying error is included in the message.",
  "pjt.exec.command-failed":
    "A command run by projitect exited non-zero or could not be started. Its exit code, stdout and stderr are included.",
  "pjt.exec.command-not-permitted":
    "A blueprint tried to run a command that none of its declared `exec` permissions names exactly.",
  "pjt.pm.not-detected":
    "Could not figure out which package manager you're using. Add a lockfile (`pnpm-lock.yaml`, `package-lock.json`, etc.) at your project root.",
  "pjt.pm.install-failed":
    "The package manager install command exited non-zero. The underlying error is included in the message.",
  "pjt.add.markers-missing":
    "Your `.pjt.ts` is missing the marker comment pairs `pjt:imports` and `pjt:blueprints`. `pjt add` uses those as splice anchors. Restore them and re-run.",
  "pjt.add.metadata-missing":
    "The package you added has no `projitect` field in its package.json, so `pjt add` can't splice it. Import it in `.pjt.ts` by hand, then run `pjt remodel`.",
  "pjt.worker.crashed":
    "The worker process that runs blueprint code crashed before it returned a result. The exit code or signal is included in the message.",
  "pjt.worker.timed-out":
    "The worker process that runs blueprint code did not finish within its time limit and was stopped. Check for a blueprint that never completes.",
  "pjt.worker.exited-early":
    "The worker process that runs blueprint code exited before it finished its work. The exit code or signal is included in the message.",
}
