import { Effect, Match, Option, Terminal } from "effect"
import type { Prompt } from "effect/unstable/cli"
import { Argument, Command, Flag } from "effect/unstable/cli"
import type { Errors, ProjitectConfig } from "@projitect/core"
import { chooseSectionsInteractive } from "@projitect/blueprint"
import type { SectionStrategy } from "@projitect/blueprint"
import { parseEnv, resolveConfig } from "../config-cascade.js"
import { inspect, renderInspectJson } from "./inspect.js"
import { InspectJsonSchemaUrl } from "./inspect-json.js"
import { remodel } from "./remodel.js"
import { build, renderBuildResult } from "./build.js"
import { init } from "./init.js"
import { explain, explainCommands } from "./explain.js"
import { add } from "./add.js"

/**
 * Per-handler error renderer. Catches our typed `ProjitectError` union and writes a
 * consistent `Error [id]: message` line plus the docs URL / explain hint — or, with `json`, an
 * `{ "error": { ... } }` object carrying the error's id and fields. Sets `process.exitCode = 1`
 * so the CLI exits non-zero. Returns void so the handler chain stays happy.
 */
const reportError = (
  error: Errors.ProjitectError,
  json = false,
): Effect.Effect<void, never, Terminal.Terminal> =>
  Effect.gen(function* () {
    if (json) {
      yield* display(`${JSON.stringify({ error }, null, 2)}\n`)
    } else {
      yield* display(`Error [${error.id}]: ${error.message}\n`)
      yield* display(
        `  See https://projitect.dev/errors/${error.id} or run \`pjt explain ${error.id}\`\n`,
      )
    }
    process.exitCode = 1
  })

const jsonFlag = (description: string) =>
  Flag.boolean("json").pipe(Flag.withDefault(false), Flag.withDescription(description))

const display = (text: string): Effect.Effect<void, never, Terminal.Terminal> =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal
    // Best-effort write; PlatformError on display is non-actionable from a handler
    yield* Effect.ignore(terminal.display(text))
  })

const configFromEnv = (): ProjitectConfig.ProjitectConfig =>
  resolveConfig({
    env: parseEnv(process.env),
    cliArgs: { projectRoot: process.cwd() },
  })

// ---------------------------------------------------------------------------
// pjt init
// ---------------------------------------------------------------------------

const initCmd = Command.make(
  "init",
  {
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Auto-bootstrap missing `.git/` (via `git init`) and `package.json` (minimal stub).",
      ),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const result = yield* init({ config, yes: input.yes }).pipe(
        Effect.matchEffect({
          onSuccess: (r) => Effect.succeed(r),
          onFailure: (error: Errors.ProjitectError) => reportError(error).pipe(Effect.as(null)),
        }),
      )
      if (result === null) {
        return
      }
      const lines: string[] = []
      if (result.bootstrappedGit) {
        lines.push("Initialized git repo (.git/)")
      }
      if (result.bootstrappedPackageJson) {
        lines.push("Created package.json")
      }
      if (result.seededBlueprintFile) {
        lines.push(`Created ${config.blueprintFile}`)
      }
      if (result.remodel.written.length > 0) {
        lines.push(
          `Wrote ${result.remodel.written.length} file${result.remodel.written.length === 1 ? "" : "s"}:`,
          ...result.remodel.written.map((p) => `  ${p}`),
        )
      }
      lines.push(
        "",
        "projitect initialized. Edit `.pjt.ts` to add blueprints, then run `pnpm pjt remodel`.",
      )
      yield* display(`${lines.join("\n")}\n`)
    }),
).pipe(Command.withDescription("Bootstrap projitect in the current project."))

// ---------------------------------------------------------------------------
// pjt remodel
// ---------------------------------------------------------------------------

const remodelCmd = Command.make(
  "remodel",
  {
    json: jsonFlag("Emit the result, or the error with its id and fields, as JSON."),
  },
  (input) =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const result = yield* remodel({ config }).pipe(
        Effect.matchEffect({
          onSuccess: (r) => Effect.succeed(r),
          onFailure: (error: Errors.ProjitectError) =>
            reportError(error, input.json).pipe(Effect.as(null)),
        }),
      )
      if (result === null) {
        return
      }
      if (input.json) {
        yield* display(`${JSON.stringify(result, null, 2)}\n`)
        return
      }
      const parts: string[] = []
      if (result.written.length > 0) {
        parts.push(
          `Wrote ${result.written.length} file${result.written.length === 1 ? "" : "s"}:`,
          ...result.written.map((p) => `  ${p}`),
        )
      }
      if (result.removed.length > 0) {
        parts.push(
          `Cleaned up ${result.removed.length} orphan${result.removed.length === 1 ? "" : "s"}:`,
          ...result.removed.map((p) => `  ${p}`),
        )
      }
      if (result.ran.length > 0) {
        parts.push(
          `Ran ${result.ran.length} command${result.ran.length === 1 ? "" : "s"}:`,
          ...result.ran.map((c) => `  ${c}`),
        )
      }
      if (parts.length === 0) {
        parts.push("Project already in sync. No changes written.")
      }
      yield* display(`${parts.join("\n")}\n`)
    }),
).pipe(
  Command.withDescription(
    "Apply the blueprint plan to disk (non-destructive), then run post-apply commands.",
  ),
)

// ---------------------------------------------------------------------------
// pjt inspect
// ---------------------------------------------------------------------------

const inspectCmd = Command.make(
  "inspect",
  {
    json: Flag.boolean("json").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        `Emit machine-readable JSON output conforming to ${InspectJsonSchemaUrl}; an error is emitted as an \`{ "error": ... }\` object. Exit code still 1 on drift.`,
      ),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const result = yield* inspect({ config }).pipe(
        Effect.matchEffect({
          onSuccess: (r) => Effect.succeed(r),
          onFailure: (error: Errors.ProjitectError) =>
            reportError(error, input.json).pipe(Effect.as(null)),
        }),
      )
      if (result === null) {
        return
      }
      const rendered = input.json ? renderInspectJson(result) : `${result.output}\n`
      yield* display(rendered)
      if (result.hasDrift) {
        process.exitCode = 1
      }
    }),
).pipe(
  Command.withDescription(
    "Report drift between project and blueprints (exit 1 on drift; built for CI).",
  ),
)

// ---------------------------------------------------------------------------
// pjt build --force
// ---------------------------------------------------------------------------

const buildCmd = Command.make(
  "build",
  {
    force: Flag.boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Required. Wipe the project tree and rebuild from scratch."),
    ),
    forceDirty: Flag.boolean("force-dirty").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Allow wiping even when git has uncommitted changes."),
    ),
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip the interactive confirmation prompt."),
    ),
    json: jsonFlag("Emit the result, or the error with its id and fields, as JSON."),
  },
  (input) =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const result = yield* build({
        config,
        force: input.force,
        forceDirty: input.forceDirty,
        yes: input.yes,
      }).pipe(
        Effect.matchEffect({
          onSuccess: (r) => Effect.succeed(r),
          onFailure: (error) =>
            Match.value(error).pipe(
              // QuitError from Prompt = user pressed Ctrl-C; treat as graceful cancel.
              Match.tag("QuitError", () => {
                process.exitCode = 130
                return display("Cancelled.\n").pipe(Effect.as(null))
              }),
              Match.orElse((projitectError) =>
                reportError(projitectError, input.json).pipe(Effect.as(null)),
              ),
            ),
        }),
      )
      if (result === null) {
        return
      }
      if (input.json) {
        yield* display(`${JSON.stringify(result, null, 2)}\n`)
        return
      }
      yield* display(renderBuildResult(result))
    }),
).pipe(
  Command.withDescription(
    "Scratch-build the project from blueprints. Destructive — requires --force and clean git.",
  ),
)

// ---------------------------------------------------------------------------
// pjt explain <error-id>
// ---------------------------------------------------------------------------

const explainCmd = Command.make(
  "explain",
  {
    errorId: Argument.string("error-id").pipe(Argument.optional),
    json: jsonFlag(
      "With no error id, emit the post-apply command listing (or the error with its id and fields) as JSON.",
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const out = yield* Option.match(input.errorId, {
        onSome: (errorId) => explain({ errorId }),
        onNone: () =>
          explainCommands({ config: configFromEnv(), json: input.json }).pipe(
            Effect.catch((error: Errors.ProjitectError) =>
              reportError(error, input.json).pipe(Effect.as(null)),
            ),
          ),
      })
      if (out !== null) {
        yield* display(`${out}\n`)
      }
    }),
).pipe(
  Command.withDescription(
    "Print a description of a projitect error id, or list the project's post-apply commands.",
  ),
)

// ---------------------------------------------------------------------------
// pjt add <package>
// ---------------------------------------------------------------------------

const addCmd = Command.make(
  "add",
  {
    pkg: Argument.string("package"),
    section: Flag.string("section").pipe(
      Flag.optional,
      Flag.withDescription(
        "Comma-separated section names for blueprint-set packages (e.g. `--section macOs,node`).",
      ),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const explicitSections = Option.match(input.section, {
        onNone: () => null as readonly string[] | null,
        onSome: (raw) =>
          raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
      })

      // When `--section` is given, honor it verbatim. Otherwise: if stdin is a TTY, ask the
      // user via `Prompt.multiSelect`; if not (CI / piped), fall back to "all" so scripted
      // installs stay deterministic. The strategy is parametrized over Prompt.Environment so
      // the requirement propagates out through `add`; Command.run provides the platform.
      const strategy: SectionStrategy<Prompt.Environment> =
        explicitSections === null
          ? process.stdin.isTTY
            ? { _tag: "Ask", choose: chooseSectionsInteractive }
            : { _tag: "All" }
          : { _tag: "Explicit", sections: explicitSections }

      const result = yield* add({ config, pkg: input.pkg, strategy }).pipe(
        Effect.matchEffect({
          onSuccess: (r) => Effect.succeed(r),
          onFailure: (error: Errors.ProjitectError) => reportError(error).pipe(Effect.as(null)),
        }),
      )
      if (result === null) {
        return
      }
      const lines = [`Installed ${result.pkg} via ${result.pm}.`]
      if (result.splicedIntoBlueprintFile) {
        if (result.sectionsAdded.length > 0) {
          lines.push(`Added to ${config.blueprintFile}: ${result.sectionsAdded.join(", ")}.`)
        } else {
          lines.push(`Added to ${config.blueprintFile}.`)
        }
        lines.push("Run `pjt remodel` to apply.")
      } else {
        lines.push(`No sections selected; ${config.blueprintFile} was not changed.`)
      }
      yield* display(`${lines.join("\n")}\n`)
    }),
).pipe(
  Command.withDescription(
    "Install a blueprint package and splice it into .pjt.ts via the marker anchors.",
  ),
)

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export const rootCommand = Command.make("pjt").pipe(
  Command.withDescription("Project scaffolding that stays in sync — drift-aware blueprints."),
  Command.withSubcommands([initCmd, remodelCmd, inspectCmd, buildCmd, explainCmd, addCmd]),
)

export type RootCommand = typeof rootCommand
