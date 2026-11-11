import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit, Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Errors, ProjitectConfig } from "@projitect/core"
import type { ChangeSet, Permission } from "@projitect/core"
import { explainCommands } from "../src/commands/explain.js"
import { inspect, renderInspectJson } from "../src/commands/inspect.js"
import { InspectJson } from "../src/commands/inspect-json.js"
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
  await fs.rm(cwd, { recursive: true, force: true })
})

const config = () => ProjitectConfig.resolve({ projectRoot: cwd, blueprintFile: FIXTURE })

// The confined worker has an empty environment, so the fixture reads its blueprints from the
// project's `package.json` through the permission-gated filesystem.
const declare = async (
  blueprints: readonly {
    id: string
    permissions?: readonly Permission.Permission[]
    operations: readonly ChangeSet.ExecOp[]
  }[],
) => {
  await fs.writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ pjtTestPostApply: blueprints.map((b) => ({ permissions: [], ...b })) }),
  )
}

describe("pjt inspect with Exec ops", () => {
  it("reports clean when every check passes", async () => {
    await declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
    ])
    const { calls, spawner } = fakeSpawner({})
    const result = await Effect.runPromise(inspect({ config: config(), spawner }))
    expect(calls).toEqual(["fmt:check"])
    expect(result.hasDrift).toBe(false)
    expect(result.commands).toEqual([])
  })

  it("reports a failing check as drift with a structured entry", async () => {
    await declare([
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
    const json = Schema.decodeUnknownSync(Schema.fromJsonString(InspectJson))(
      renderInspectJson(result),
    )
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
    await declare([{ id: "a", operations: [execOp("a", "fmt", "fmt:check")] }])
    const { calls, spawner } = fakeSpawner({})
    const exit = await Effect.runPromiseExit(inspect({ config: config(), spawner }))
    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(error).toBeInstanceOf(Errors.CommandNotPermitted)
    expect(calls).toEqual([])
  })

  it("runs an identical check once and skips commands without a check", async () => {
    await declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
      { id: "b", permissions: [exec("fmt:check")], operations: [execOp("b", "fmt2", "fmt:check")] },
      { id: "c", operations: [execOp("c", "no-check")] },
    ])
    const { calls, spawner } = fakeSpawner({})
    const result = await Effect.runPromise(inspect({ config: config(), spawner }))
    expect(calls).toEqual(["fmt:check"])
    expect(result.hasDrift).toBe(false)
  })

  it("checks every owner's permission before starting even a permitted duplicate check", async () => {
    await declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
      { id: "b", operations: [execOp("b", "fmt", "fmt:check")] },
    ])
    const { calls, spawner } = fakeSpawner({})
    const result = await Effect.runPromiseExit(inspect({ config: config(), spawner }))
    expect(Exit.isFailure(result) ? Cause.squash(result.cause) : undefined).toBeInstanceOf(
      Errors.CommandNotPermitted,
    )
    expect(calls).toEqual([])
  })

  it("rejects an invalid lockfile before starting any checks", async () => {
    await declare([
      { id: "a", permissions: [exec("fmt:check")], operations: [execOp("a", "fmt", "fmt:check")] },
    ])
    await fs.writeFile(path.join(cwd, ".pjt.lock"), "not valid JSON")
    const { calls, spawner } = fakeSpawner({})
    const result = await Effect.runPromiseExit(inspect({ config: config(), spawner }))
    expect(Exit.isFailure(result) ? Cause.squash(result.cause) : undefined).toBeInstanceOf(
      Errors.LockParseFailed,
    )
    expect(calls).toEqual([])
  })

  it("reports a check that could not start as drift and still runs later checks", async () => {
    await declare([
      { id: "a", permissions: [exec("missing")], operations: [execOp("a", "fix-a", "missing")] },
      {
        id: "b",
        permissions: [exec("available")],
        operations: [execOp("b", "fix-b", "available")],
      },
    ])
    const calls: string[] = []
    const spawner: ProcessSpawner = (program) => {
      calls.push(program)
      return program === "missing"
        ? Effect.fail("executable not found")
        : Effect.succeed({ exitCode: 0, stdout: "", stderr: "" })
    }
    const result = await Effect.runPromise(inspect({ config: config(), spawner }))
    expect(calls).toEqual(["missing", "available"])
    expect(result.hasDrift).toBe(true)
    expect(result.commands).toEqual([
      { ownerId: "a", check: "missing", stdout: "", stderr: "executable not found" },
    ])
  })
})

describe("pjt explain with no error id", () => {
  it("lists each exec operation with its owner, fix and check, in text and JSON", async () => {
    await declare([
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
    await declare([])
    const text = await Effect.runPromise(explainCommands({ config: config(), json: false }))
    expect(text).toBe("No blueprint declares post-apply commands.")
  })
})

describe("two blueprints sharing one fix with different checks", () => {
  it("explain lists both declarations and inspect reports the failing second check", async () => {
    await declare([
      {
        id: "a",
        permissions: [exec("fmt:check-a")],
        operations: [execOp("a", "fmt", "fmt:check-a")],
      },
      {
        id: "b",
        permissions: [exec("fmt:check-b")],
        operations: [execOp("b", "fmt", "fmt:check-b")],
      },
    ])
    const text = await Effect.runPromise(explainCommands({ config: config(), json: false }))
    expect(text).toContain("a\n  fix:   fmt\n  check: fmt:check-a")
    expect(text).toContain("b\n  fix:   fmt\n  check: fmt:check-b")
    const json = await Effect.runPromise(explainCommands({ config: config(), json: true }))
    expect(JSON.parse(json)).toEqual({
      commands: [
        { ownerId: "a", fix: "fmt", check: "fmt:check-a" },
        { ownerId: "b", fix: "fmt", check: "fmt:check-b" },
      ],
    })
    const { calls, spawner } = fakeSpawner({ "fmt:check-b": { exitCode: 1 } })
    const result = await Effect.runPromise(inspect({ config: config(), spawner }))
    expect(calls).toEqual(["fmt:check-a", "fmt:check-b"])
    expect(result.commands.map((c) => c.ownerId)).toEqual(["b"])
  })
})
