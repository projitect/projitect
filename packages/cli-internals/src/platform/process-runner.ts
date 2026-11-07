import { spawn } from "node:child_process"
import { Array, Effect } from "effect"
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
  })

/**
 * Runs `command` (split on whitespace into program and args) in `cwd`, after checking it against
 * the declared `exec` permissions. A command no permission names exactly fails with
 * `CommandNotPermitted` and the spawner is never called; a non-zero exit or spawn failure fails
 * with `CommandFailed` carrying the exit code and captured output.
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
    const [program = "", ...args] = Array.filter(command.split(/\s+/u), (part) => part !== "")
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
