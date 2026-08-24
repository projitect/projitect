import { Effect, Match, Option, Terminal } from "effect"
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli"
import type { Errors, ProjitectConfig } from "@projitect/core"
import type { ProjitectPackageMetadata } from "../pm.js"
import { parseEnv, resolveConfig } from "../config-cascade.js"
import { inspect, renderInspectJson } from "./inspect.js"
import { remodel } from "./remodel.js"
import { build } from "./build.js"
import { init } from "./init.js"
import { explain } from "./explain.js"
import { add } from "./add.js"
import type { SectionStrategy } from "./add.js"

/**
 * Per-handler error renderer. Catches our typed `ProjitectError` union and writes a
 * consistent `Error [id]: message` line plus the docs URL / explain hint. Sets
 * `process.exitCode = 1` so the CLI exits non-zero. Returns void so the handler chain stays
 * happy.
 */
const reportError = (error: Errors.ProjitectError): Effect.Effect<void, never, Terminal.Terminal> =>
  Effect.gen(function* () {
    yield* display(`Error [${error.id}]: ${error.message}\n`)
    yield* display(
      `  See https://projitect.dev/errors/${error.id} or run \`pjt explain ${error.id}\`\n`,
    )
    process.exitCode = 1
  })

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

/**
 * Interactive section picker for `pjt add` against a `type: "blueprint-set"` package. The
 * dispatcher passes this as the `ask` callback so the command logic stays Prompt-free.
 *
 * Returns the package's full section list if no sections are declared (defensive default —
 * shouldn't happen for well-formed metadata, but we don't want to crash on a malformed package).
 */
const chooseSectionsInteractive = (
  metadata: ProjitectPackageMetadata,
): Effect.Effect<readonly string[], never, Prompt.Environment> => {
  const sections = metadata.sections ?? []
  if (sections.length === 0) {
    return Effect.succeed([])
  }
  return Prompt.multiSelect({
    message: "Pick sections to add (space to toggle, enter to confirm):",
    choices: sections.map((name) => ({ title: name, value: name })),
  }).pipe(Effect.catchTag("QuitError", () => Effect.succeed([] as readonly string[])))
}

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

const remodelCmd = Command.make("remodel", {}, () =>
  Effect.gen(function* () {
    const config = configFromEnv()
    const result = yield* remodel({ config }).pipe(
      Effect.matchEffect({
        onSuccess: (r) => Effect.succeed(r),
        onFailure: (error: Errors.ProjitectError) => reportError(error).pipe(Effect.as(null)),
      }),
    )
    if (result === null) {
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
    if (parts.length === 0) {
      parts.push("Project already in sync. No changes written.")
    }
    yield* display(`${parts.join("\n")}\n`)
  }),
).pipe(
  Command.withDescription(
    "Apply the blueprint plan to disk (non-destructive). Adds + updates + removes orphan claims.",
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
        "Emit machine-readable JSON output { hasDrift, files, removals, upgrades }. Exit code still 1 on drift.",
      ),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const result = yield* inspect({ config }).pipe(
        Effect.matchEffect({
          onSuccess: (r) => Effect.succeed(r),
          onFailure: (error: Errors.ProjitectError) => reportError(error).pipe(Effect.as(null)),
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
              Match.orElse((projitectError) => reportError(projitectError).pipe(Effect.as(null))),
            ),
        }),
      )
      if (result === null) {
        return
      }
      const lines: string[] = []
      if (result.wiped.length === 0 && result.remodel.written.length === 0) {
        lines.push("Cancelled. No changes made.")
      } else {
        if (result.wiped.length > 0) {
          lines.push(
            `Wiped ${result.wiped.length} entr${result.wiped.length === 1 ? "y" : "ies"}:`,
            ...result.wiped.map((p) => `  ${p}`),
          )
        }
        if (result.remodel.written.length > 0) {
          lines.push(
            `Rebuilt ${result.remodel.written.length} file${result.remodel.written.length === 1 ? "" : "s"} from the plan:`,
            ...result.remodel.written.map((p) => `  ${p}`),
          )
        }
      }
      yield* display(`${lines.join("\n")}\n`)
    }),
).pipe(
  Command.withDescription(
    "Scratch-build the project from blueprints. Destructive — requires --force and clean git.",
  ),
)

// ---------------------------------------------------------------------------
// pjt explain <error-id>
// ---------------------------------------------------------------------------

const explainCmd = Command.make("explain", { errorId: Argument.string("error-id") }, (input) =>
  Effect.gen(function* () {
    const out = yield* explain({ errorId: input.errorId })
    yield* display(`${out}\n`)
  }),
).pipe(Command.withDescription("Print a description of a projitect error id."))

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
        lines.push(
          `${result.pkg} has no \`"projitect"\` metadata in its package.json, so we can't auto-splice into ${config.blueprintFile}.`,
          "Edit it by hand, then run `pjt remodel`.",
        )
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
