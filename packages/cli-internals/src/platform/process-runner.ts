import { spawn } from "node:child_process"
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

/** Real spawner: `node:child_process` without a shell, so `&&`, `;` and pipes are plain arguments. */
export const nodeSpawner: ProcessSpawner = (program, args, cwd) =>
  Effect.callback((resume) => {
    const child = spawn(program, args, { cwd, shell: false })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = stdout + chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: Buffer) => {
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
      return yield* new Errors.CommandNotPermitted({
        id: "pjt.exec.command-not-permitted",
        command,
        message: `No declared exec permission covers \`${command}\``,
      })
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
