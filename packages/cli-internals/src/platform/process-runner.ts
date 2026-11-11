import path from "node:path"
import spawn from "cross-spawn"
import which from "which"
import { Effect, Option } from "effect"
import { Errors } from "@projitect/core"
import type { Permission } from "@projitect/core"
import { isCommandPermitted } from "../permissions.js"

export interface CommandOutput {
  readonly stdout: string
  readonly stderr: string
}

/**
 * Starts a process and resolves with its exit code and captured output. `exitCode` is `undefined`
 * only when the process never started (spawn failure); the failure carries the reason. Injected
 * into `runCommand` so tests can use a fake instead of a real process.
 */
export type ProcessSpawner = (
  program: string,
  args: readonly string[],
  cwd: string,
) => Effect.Effect<CommandOutput & { readonly exitCode: number }, string>

/** Where a project's own tools live: only the project root's bin directory, never an ancestor's. */
const localBinDirectory = (cwd: string): string => path.join(cwd, "node_modules", ".bin")

/** True when the program names a location (relative or absolute) instead of a bare tool name. */
const isExplicitPath = (program: string): boolean =>
  program.includes("/") || (path.sep === "\\" && program.includes("\\"))

/** The env key holding PATH: Windows keys are case-insensitive, so reuse the existing spelling. */
const pathKey = (env: NodeJS.ProcessEnv): string =>
  Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH"

/**
 * Windows runs `.cmd`/`.bat` shims through `cmd.exe` (cross-spawn escapes the metacharacters but
 * cannot stop `%VAR%` expansion, and a line break ends the command), so those arguments are
 * refused instead of being rewritten. `undefined` means the argument is safe to pass literally.
 */
const unsafeShimArgument = (file: string, args: readonly string[]): string | undefined =>
  process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(file)
    ? args.find((arg) => /[\0\n\r%]/u.test(arg))
    : undefined

/**
 * Real spawner: `cross-spawn` without a shell, so `&&`, `;` and pipes are plain arguments. A bare
 * program name resolves against `<cwd>/node_modules/.bin` first, then the caller's PATH; an explicit
 * path runs as given (relative to `cwd`). The child gets a fresh env whose PATH has the local bin
 * directory prepended; `process.env` is never modified. Relative and empty PATH entries mean the
 * same directory they mean to the child (resolved against `cwd`), never the caller's working
 * directory. On Windows, cross-spawn runs `.cmd`/`.bat` shims through `cmd.exe`: an argument that
 * cannot be passed literally there fails with an explicit message instead of being altered.
 */
export const nodeSpawner: ProcessSpawner = (program, args, cwd) =>
  Effect.callback((resume) => {
    const localBin = localBinDirectory(cwd)
    const env: NodeJS.ProcessEnv = { ...process.env }
    const key = pathKey(env)
    const callerPath = env[key] ?? ""
    const callerEntries =
      env[key] === undefined
        ? []
        : callerPath.split(path.delimiter).map((e) => path.resolve(cwd, e))
    const searched = [localBin, ...callerEntries]
    let file: string
    if (isExplicitPath(program)) {
      file = path.isAbsolute(program) ? program : path.resolve(cwd, program)
    } else {
      const found = which.sync(program, { path: searched.join(path.delimiter), nothrow: true })
      if (found === null) {
        resume(
          Effect.fail(
            `spawn ${program} ENOENT: \`${program}\` not found in ${searched.join(", ")}`,
          ),
        )
        return Effect.void
      }
      file = found
    }
    const unsafe = unsafeShimArgument(file, args)
    if (unsafe !== undefined) {
      resume(
        Effect.fail(
          `${file} is a Windows shim run through cmd.exe, which cannot pass ${JSON.stringify(unsafe)} literally (%, line breaks and NUL); run the tool's script directly instead`,
        ),
      )
      return Effect.void
    }
    env[key] = env[key] === undefined ? localBin : `${localBin}${path.delimiter}${callerPath}`
    const child = spawn(file, [...args], { cwd, env, shell: false })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = stdout + chunk.toString("utf8")
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = stderr + chunk.toString("utf8")
    })
    child.on("error", (error) => {
      resume(Effect.fail(error.message))
    })
    child.on("close", (code) => {
      resume(Effect.succeed({ exitCode: code ?? 1, stdout, stderr }))
    })
    // On interruption, terminate the child we own so it doesn't outlive the fiber.
    return Effect.sync(() => {
      child.kill("SIGKILL")
    })
  })

/**
 * Argv contract (no shell): arguments are separated by unquoted whitespace; `'...'` and `"..."`
 * group characters (including whitespace) into one argument and the quotes are dropped. There are
 * no escapes, globs, variables or operators — everything else is literal. An unterminated quote,
 * or a command with no program, is unsupported and yields `None`. The permission is matched
 * against the raw string, so exactly what was declared is what gets parsed and run.
 */
export const parseArgv = (command: string): Option.Option<readonly string[]> => {
  const argv: string[] = []
  let current: string | undefined
  let quote: string | undefined
  for (const ch of command) {
    if (quote !== undefined) {
      if (ch === quote) {
        quote = undefined
      } else {
        current = (current ?? "") + ch
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch
      current = current ?? ""
    } else if (/\s/u.test(ch)) {
      if (current !== undefined) {
        argv.push(current)
        current = undefined
      }
    } else {
      current = (current ?? "") + ch
    }
  }
  if (quote !== undefined) {
    return Option.none()
  }
  if (current !== undefined) {
    argv.push(current)
  }
  return argv[0] === undefined || argv[0] === "" ? Option.none() : Option.some(argv)
}

/** The refusal for a command no declared `exec` permission names exactly. */
export const commandNotPermitted = (command: string): Errors.CommandNotPermitted =>
  new Errors.CommandNotPermitted({
    id: "pjt.exec.command-not-permitted",
    command,
    message: `No declared exec permission covers \`${command}\``,
  })

/**
 * Runs `command` (parsed per `parseArgv`) in `cwd`, after checking it against
 * the declared `exec` permissions. A command no permission names exactly fails with
 * `CommandNotPermitted` and the spawner is never called; a non-zero exit or spawn failure fails
 * with `CommandFailed` carrying the exit code and captured output; so does a command `parseArgv`
 * rejects (the spawner is not called).
 */
export const runCommand = (params: {
  readonly permissions: readonly Permission.Permission[]
  readonly command: string
  readonly cwd: string
  readonly spawner: ProcessSpawner
}): Effect.Effect<CommandOutput, Errors.CommandFailed | Errors.CommandNotPermitted> => {
  const { permissions, command, cwd, spawner } = params
  return Effect.gen(function* () {
    if (!isCommandPermitted(permissions, command)) {
      return yield* commandNotPermitted(command)
    }
    const [program = "", ...args] = yield* Option.match(parseArgv(command), {
      onNone: () =>
        Effect.fail(
          new Errors.CommandFailed({
            id: "pjt.exec.command-failed",
            command,
            stdout: "",
            stderr: "",
            cause: "unsupported command syntax: empty program or unterminated quote",
            message: `Cannot run \`${command}\`: empty program or unterminated quote`,
          }),
        ),
      onSome: Effect.succeed,
    })
    const result = yield* Effect.mapError(
      spawner(program, args, cwd),
      (cause) =>
        new Errors.CommandFailed({
          id: "pjt.exec.command-failed",
          command,
          stdout: "",
          stderr: "",
          cause,
          message: `Failed to start \`${command}\`: ${cause}`,
        }),
    )
    if (result.exitCode !== 0) {
      return yield* new Errors.CommandFailed({
        id: "pjt.exec.command-failed",
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        message: `\`${command}\` exited with code ${String(result.exitCode)}`,
      })
    }
    return { stdout: result.stdout, stderr: result.stderr }
  })
}
