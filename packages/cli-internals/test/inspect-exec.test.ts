import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Errors, ProjitectConfig } from "@projitect/core"
import type { ChangeSet, Permission } from "@projitect/core"
import { explainCommands } from "../src/commands/explain.js"
import { inspect, renderInspectJson } from "../src/commands/inspect.js"
import type { ProcessSpawner } from "../src/platform/process-runner.js"

/**
 * `pjt inspect` runs the `check` of each `Exec` op through the permission-gated runner and turns a
 * failing check into drift. A fake spawner stands in for real processes.
 */

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/post-apply.pjt.ts",
)

const exec = (command: string): Permission.Permission => ({ kind: "exec", command })

const execOp = (ownerId: string, command: string, check?: string): ChangeSet.ExecOp => ({
  _tag: "Exec",
  ownerId,
  command,
  ...(check === undefined ? {} : { check }),
})

const fakeSpawner = (results: Readonly<Record<string, { exitCode: number; stderr?: string }>>) => {
  const calls: string[] = []
  const spawner: ProcessSpawner = (program, args) => {
    const command = [program, ...args].join(" ")
    calls.push(command)
    const result = results[command] ?? { exitCode: 0 }
    return Effect.succeed({ exitCode: result.exitCode, stdout: "out", stderr: result.stderr ?? "" })
  }
  return { calls, spawner }
}

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-inspect-exec-"))
})

afterEach(async () => {
  delete process.env["PJT_TEST_POST_APPLY"]
  await fs.rm(cwd, { recursive: true, force: true })
})

const config = () => ProjitectConfig.resolve({ projectRoot: cwd, blueprintFile: FIXTURE })

const declare = (
  blueprints: readonly {
    id: string
    permissions?: readonly Permission.Permission[]
    operations: readonly ChangeSet.ExecOp[]
  }[],
) => {
  process.env["PJT_TEST_POST_APPLY"] = JSON.stringify(
    blueprints.map((b) => ({ permissions: [], ...b })),
  )
}

describe("pjt inspect with Exec ops", () => {
  it("reports clean when every check passes", async () => {
    declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
    ])
    const { calls, spawner } = fakeSpawner({})
    const result = await Effect.runPromise(inspect({ config: config(), spawner }))
    expect(calls).toEqual(["fmt:check"])
    expect(result.hasDrift).toBe(false)
    expect(result.commands).toEqual([])
  })

  it("reports a failing check as drift with a structured entry", async () => {
    declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
    ])
    const { spawner } = fakeSpawner({ "fmt:check": { exitCode: 3, stderr: "bad format" } })
    const result = await Effect.runPromise(inspect({ config: config(), spawner }))
    expect(result.hasDrift).toBe(true)
    expect(result.commands).toEqual([
      { ownerId: "a", check: "fmt:check", exitCode: 3, stdout: "out", stderr: "bad format" },
    ])
    expect(result.output).toContain("! check failed: fmt:check (exit 3)")
    expect(result.output).toContain("bad format")
    const json = JSON.parse(renderInspectJson(result)) as { commands: unknown[]; files: unknown[] }
    expect(json.commands).toEqual([
      {
        ownerId: "a",
        check: "fmt:check",
        status: "failed",
        exitCode: 3,
        stdout: "out",
        stderr: "bad format",
      },
    ])
    expect(json.files).toEqual([])
  })

  it("fails with command-not-permitted when the blueprint lacks the exec permission", async () => {
    declare([{ id: "a", operations: [execOp("a", "fmt", "fmt:check")] }])
    const { calls, spawner } = fakeSpawner({})
    const exit = await Effect.runPromiseExit(inspect({ config: config(), spawner }))
    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(error).toBeInstanceOf(Errors.CommandNotPermitted)
    expect(calls).toEqual([])
  })

  it("runs an identical check once and skips commands without a check", async () => {
    declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
      { id: "b", permissions: [exec("fmt:check")], operations: [execOp("b", "fmt2", "fmt:check")] },
      { id: "c", operations: [execOp("c", "no-check")] },
    ])
    const { calls, spawner } = fakeSpawner({})
    const result = await Effect.runPromise(inspect({ config: config(), spawner }))
    expect(calls).toEqual(["fmt:check"])
    expect(result.hasDrift).toBe(false)
  })
})

describe("pjt explain with no error id", () => {
  it("lists each exec operation with its owner, fix and check, in text and JSON", async () => {
    declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
      { id: "c", operations: [execOp("c", "no-check")] },
    ])
    const text = await Effect.runPromise(explainCommands({ config: config(), json: false }))
    expect(text).toContain("a\n  fix:   fmt\n  check: fmt:check")
    expect(text).toContain("c\n  fix:   no-check")
    const json = await Effect.runPromise(explainCommands({ config: config(), json: true }))
    expect(JSON.parse(json)).toEqual({
      commands: [
        { ownerId: "a", fix: "fmt", check: "fmt:check" },
        { ownerId: "c", fix: "no-check" },
      ],
    })
  })

  it("says so when no blueprint declares a command", async () => {
    declare([])
    const text = await Effect.runPromise(explainCommands({ config: config(), json: false }))
    expect(text).toBe("No blueprint declares post-apply commands.")
  })
})
