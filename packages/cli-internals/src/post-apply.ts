import { Array, Effect, Option } from "effect"
import type { Errors } from "@projitect/core"
import { isCommandPermitted } from "./permissions.js"
import type { PlannedCommand } from "./plan.js"
import { commandNotPermitted, nodeSpawner, runCommand } from "./platform/process-runner.js"
import type { ProcessSpawner } from "./platform/process-runner.js"

/**
 * The final phase of `build` and `remodel`: run the plan's `Exec` commands once every file
 * operation has succeeded.
 *
 * Every declaring blueprint's permissions must cover its own command; that is checked for the whole
 * list before any command starts, so a denial never leaves a half-run phase. Identical command
 * strings run once, at their first position. Commands run sequentially from the project root, in
 * blueprint tree order then op order, and the first failure stops the phase. Returns the commands
 * that ran.
 */
export const runPostApply = (params: {
  readonly commands: readonly PlannedCommand[]
  readonly projectRoot: string
  readonly spawner?: ProcessSpawner
}): Effect.Effect<readonly string[], Errors.ExecError> =>
  Effect.gen(function* () {
    const { commands, projectRoot, spawner = nodeSpawner } = params
    const denied = Array.findFirst(
      commands,
      (planned) => !isCommandPermitted(planned.permissions, planned.command),
    )
    if (Option.isSome(denied)) {
      return yield* commandNotPermitted(denied.value.command)
    }
    const unique = Array.dedupeWith(commands, (a, b) => a.command === b.command)
    yield* Effect.forEach(
      unique,
      (planned) =>
        runCommand({
          permissions: planned.permissions,
          command: planned.command,
          cwd: projectRoot,
          spawner,
        }),
      { discard: true },
    )
    return Array.map(unique, (planned) => planned.command)
  })
