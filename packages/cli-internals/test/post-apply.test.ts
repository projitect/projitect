import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Errors, ProjitectConfig } from "@projitect/core"
import type { ChangeSet, Permission } from "@projitect/core"
import { build, renderBuildResult } from "../src/commands/build.js"
import { explain } from "../src/commands/explain.js"
import { inspect } from "../src/commands/inspect.js"
import { remodel } from "../src/commands/remodel.js"
import { makeProjectRootLayer } from "../src/filesystem-impl.js"
import { applyPlan } from "../src/applier.js"
import { diffPlan } from "../src/differ.js"
import type { PlannedCommand } from "../src/plan.js"
import { runPostApply } from "../src/post-apply.js"
import { applyRemovals } from "../src/remover.js"
import type { ProcessSpawner } from "../src/platform/process-runner.js"
import { planTree } from "./support/plan-tree.js"

/**
 * The final apply phase: `Exec` ops become `plan.commands`, and `remodel` / `build` run them only
 * after every file operation has succeeded. A fake spawner records what would have started, so no
 * real process runs.
 */

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/post-apply.pjt.ts",
)

const exec = (command: string): Permission.Permission => ({ kind: "exec", command })

const execOp = (ownerId: string, command: string): ChangeSet.ExecOp => ({
  _tag: "Exec",
  ownerId,
  command,
})

const planned = (
  ownerId: string,
  command: string,
  permissions: readonly Permission.Permission[] = [exec(command)],
): PlannedCommand => ({ ownerId, command, permissions })

const fakeSpawner = (exitCodes: Readonly<Record<string, number>> = {}) => {
  const calls: string[] = []
  const spawner: ProcessSpawner = (program, args) => {
    const command = [program, ...args].join(" ")
    calls.push(command)
    return Effect.succeed({ exitCode: exitCodes[command] ?? 0, stdout: "out", stderr: "err" })
  }
  return { calls, spawner }
}

const failureOf = <E>(exit: Exit.Exit<unknown, E>): E | undefined =>
  Exit.isFailure(exit)
    ? Exit.findErrorOption(exit).pipe((o) => (o._tag === "Some" ? o.value : undefined))
    : undefined

describe("runPostApply", () => {
  it("runs commands sequentially from the project root, in plan order", async () => {
    const cwds: string[] = []
    const { calls, spawner } = fakeSpawner()
    const recording: ProcessSpawner = (program, args, cwd) => {
      cwds.push(cwd)
      return spawner(program, args, cwd)
    }
    const ran = await Effect.runPromise(
      runPostApply({
        commands: [planned("b:one", "tool b"), planned("a:two", "tool a")],
        projectRoot: "/proj",
        spawner: recording,
      }),
    )
    expect(calls).toEqual(["tool b", "tool a"])
    expect(ran).toEqual(["tool b", "tool a"])
    expect(cwds).toEqual(["/proj", "/proj"])
  })

  it("runs an identical command once, at its first position, without a conflict", async () => {
    const { calls, spawner } = fakeSpawner()
    const ran = await Effect.runPromise(
      runPostApply({
        commands: [planned("a", "fmt"), planned("b", "lint"), planned("c", "fmt")],
        projectRoot: "/proj",
        spawner,
      }),
    )
    expect(calls).toEqual(["fmt", "lint"])
    expect(ran).toEqual(["fmt", "lint"])
  })

  it("stops at the first failing command and surfaces CommandFailed", async () => {
    const { calls, spawner } = fakeSpawner({ lint: 2 })
    const exit = await Effect.runPromiseExit(
      runPostApply({
        commands: [planned("a", "fmt"), planned("b", "lint"), planned("c", "test")],
        projectRoot: "/proj",
        spawner,
      }),
    )
    const error = failureOf(exit)
    expect(error).toBeInstanceOf(Errors.CommandFailed)
    expect(error).toMatchObject({ id: "pjt.exec.command-failed", command: "lint", exitCode: 2 })
    expect(calls).toEqual(["fmt", "lint"])
  })

  it("refuses an undeclared command before starting any command", async () => {
    const { calls, spawner } = fakeSpawner()
    const exit = await Effect.runPromiseExit(
      runPostApply({
        commands: [planned("a", "fmt"), planned("b", "rm -rf x", [exec("lint")])],
        projectRoot: "/proj",
        spawner,
      }),
    )
    expect(failureOf(exit)).toMatchObject({
      id: "pjt.exec.command-not-permitted",
      command: "rm -rf x",
    })
    expect(calls).toEqual([])
  })

  it("checks every declaring blueprint's permission, even for a duplicate command", async () => {
    const { calls, spawner } = fakeSpawner()
    const exit = await Effect.runPromiseExit(
      runPostApply({
        commands: [planned("a", "fmt"), planned("b", "fmt", [])],
        projectRoot: "/proj",
        spawner,
      }),
    )
    expect(failureOf(exit)).toBeInstanceOf(Errors.CommandNotPermitted)
    expect(calls).toEqual([])
  })

  it("runs nothing for an empty command list", async () => {
    const { calls, spawner } = fakeSpawner()
    const ran = await Effect.runPromise(
      runPostApply({ commands: [], projectRoot: "/proj", spawner }),
    )
    expect(ran).toEqual([])
    expect(calls).toEqual([])
  })
})

describe("buildPlan with Exec ops", () => {
  const blueprint = (
    id: string,
    ops: readonly ChangeSet.Operation[],
    perms: Permission.Permission[] = [],
  ) => ({
    id,
    version: "1.0.0",
    permissions: perms,
    plan: Effect.succeed({ operations: ops }),
  })

  it("splits Exec ops out of the file plan, in tree order then op order, with owner permissions", async () => {
    const { plan, byBlueprint } = await Effect.runPromise(
      planTree(
        [
          blueprint("a", [execOp("a", "first"), execOp("a", "second")], [exec("first")]),
          blueprint("b", [execOp("b", "third")]),
        ],
        os.tmpdir(),
      ),
    )
    expect(plan.files).toEqual([])
    expect(plan.commands).toEqual([
      { ownerId: "a", command: "first", permissions: [exec("first")] },
      { ownerId: "a", command: "second", permissions: [exec("first")] },
      { ownerId: "b", command: "third", permissions: [] },
    ])
    expect(byBlueprint).toEqual({})
  })

  it("lets two blueprints declare the same command without a plan conflict", async () => {
    const { plan } = await Effect.runPromise(
      planTree(
        [blueprint("a", [execOp("a", "fmt")]), blueprint("b", [execOp("b", "fmt")])],
        os.tmpdir(),
      ),
    )
    expect(plan.commands.map((c) => c.ownerId)).toEqual(["a", "b"])
  })

  it("passes through the applier, differ, remover and explain without touching files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-exec-ops-"))
    try {
      const { plan } = await Effect.runPromise(
        planTree([blueprint("a", [execOp("a", "fmt")])], root),
      )
      const layer = makeProjectRootLayer(root)
      expect(await Effect.runPromise(Effect.provide(applyPlan({ plan }), layer))).toEqual([])
      const diff = await Effect.runPromise(Effect.provide(diffPlan({ plan }), layer))
      expect(diff.hasDrift).toBe(false)
      expect(
        await Effect.runPromise(Effect.provide(applyRemovals({ removals: [] }), layer)),
      ).toEqual([])
      expect(await fs.readdir(root)).toEqual([])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
    const text = await Effect.runPromise(explain({ errorId: "pjt.inspect.operation-unsupported" }))
    expect(text).toContain("pjt.inspect.operation-unsupported")
  })
})

describe("remodel / build / inspect with Exec ops", () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-post-apply-"))
  })

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true })
  })

  const config = () => ProjitectConfig.resolve({ projectRoot: cwd, blueprintFile: FIXTURE })

  const declare = async (
    blueprints: readonly {
      id: string
      permissions?: readonly Permission.Permission[]
      operations: readonly (
        | ChangeSet.Operation
        | { _tag: "Region"; ownerId: string; path: string; commentPrefix: string; content: string }
      )[]
    }[],
  ) => {
    await fs.writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ pjtTestPostApply: blueprints.map((b) => ({ permissions: [], ...b })) }),
    )
  }

  const gitignore = (ownerId: string) => ({
    _tag: "Region" as const,
    ownerId,
    path: ".gitignore",
    commentPrefix: "#",
    content: "dist/\n",
  })

  it("remodel runs the commands after the files are written and reports them", async () => {
    await declare([
      {
        id: "a",
        permissions: [exec("fmt"), exec("lint")],
        operations: [gitignore("a"), execOp("a", "fmt"), execOp("a", "lint")],
      },
    ])
    const seen: boolean[] = []
    const { calls, spawner } = fakeSpawner()
    const checking: ProcessSpawner = (program, args, cwdArg) => {
      seen.push(cwdArg === cwd)
      return spawner(program, args, cwdArg)
    }
    const result = await Effect.runPromise(remodel({ config: config(), spawner: checking }))
    expect(result.written).toEqual([".gitignore"])
    expect(result.ran).toEqual(["fmt", "lint"])
    expect(calls).toEqual(["fmt", "lint"])
    expect(seen).toEqual([true, true])
    await expect(fs.readFile(path.join(cwd, ".gitignore"), "utf8")).resolves.toContain("dist/")
  })

  it("remodel runs no command when a file operation fails", async () => {
    await fs.writeFile(path.join(cwd, ".gitignore"), "# pjt:a start\nold\n", "utf8")
    await declare([
      {
        id: "pjt:a",
        permissions: [exec("fmt")],
        operations: [gitignore("pjt:a"), execOp("pjt:a", "fmt")],
      },
    ])
    const { calls, spawner } = fakeSpawner()
    const exit = await Effect.runPromiseExit(remodel({ config: config(), spawner }))
    expect(failureOf(exit)).toBeInstanceOf(Errors.RegionMissingEnd)
    expect(calls).toEqual([])
  })

  it("remodel surfaces a failing command as CommandFailed after the files were written", async () => {
    await declare([
      { id: "a", permissions: [exec("fmt")], operations: [gitignore("a"), execOp("a", "fmt")] },
    ])
    const { spawner } = fakeSpawner({ fmt: 3 })
    const exit = await Effect.runPromiseExit(remodel({ config: config(), spawner }))
    expect(failureOf(exit)).toMatchObject({ id: "pjt.exec.command-failed", exitCode: 3 })
    await expect(fs.readFile(path.join(cwd, ".gitignore"), "utf8")).resolves.toContain("dist/")
  })

  it("remodel refuses a command outside the blueprint's exec permission and never starts it", async () => {
    await declare([{ id: "a", permissions: [exec("fmt")], operations: [execOp("a", "rm -rf /")] }])
    const { calls, spawner } = fakeSpawner()
    const exit = await Effect.runPromiseExit(remodel({ config: config(), spawner }))
    expect(failureOf(exit)).toMatchObject({
      id: "pjt.exec.command-not-permitted",
      command: "rm -rf /",
    })
    expect(calls).toEqual([])
  })

  it("remodel does not record Exec ops in the lockfile, so commands re-run each time", async () => {
    await declare([{ id: "a", permissions: [exec("fmt")], operations: [execOp("a", "fmt")] }])
    const { calls, spawner } = fakeSpawner()
    await Effect.runPromise(remodel({ config: config(), spawner }))
    await Effect.runPromise(remodel({ config: config(), spawner }))
    expect(calls).toEqual(["fmt", "fmt"])
    const lock = await fs.readFile(path.join(cwd, ".pjt.lock"), "utf8")
    expect(lock).not.toContain("Exec")
  })

  it("build runs the commands after rebuilding the files", async () => {
    await declare([
      { id: "a", permissions: [exec("fmt")], operations: [gitignore("a"), execOp("a", "fmt")] },
    ])
    execFileSync("git", ["init", "-q"], { cwd })
    const { calls, spawner } = fakeSpawner()
    const result = await Effect.runPromise(
      build({ config: config(), force: true, forceDirty: true, yes: true, spawner }),
    )
    expect(result.remodel.ran).toEqual(["fmt"])
    expect(calls).toEqual(["fmt"])
  })

  it("build reports a command-only run as a success, not a cancellation", async () => {
    await declare([{ id: "a", permissions: [exec("fmt")], operations: [execOp("a", "fmt")] }])
    execFileSync("git", ["init", "-q"], { cwd })
    const { calls, spawner } = fakeSpawner()
    const result = await Effect.runPromise(
      build({ config: config(), force: true, forceDirty: true, yes: true, spawner }),
    )
    expect(calls).toEqual(["fmt"])
    expect(result).toMatchObject({ cancelled: false, wiped: [], remodel: { written: [] } })
    const text = renderBuildResult(result)
    expect(text).toContain("Ran 1 command:\n  fmt")
    expect(text).not.toContain("Cancelled")
  })

  it("build renders a declined confirmation as a cancellation", () => {
    const text = renderBuildResult({
      cancelled: true,
      wiped: [],
      remodel: { written: [], removed: [], ran: [] },
    })
    expect(text).toBe("Cancelled. No changes made.\n")
  })

  it("inspect fails closed with the unsupported-operation error instead of reporting clean", async () => {
    await declare([{ id: "a", permissions: [exec("fmt")], operations: [execOp("a", "fmt")] }])
    const exit = await Effect.runPromiseExit(inspect({ config: config() }))
    const error = failureOf(exit)
    expect(error).toBeInstanceOf(Errors.OperationUnsupportedOnInspect)
    // The shape `--json` emits for an error: its id and fields.
    const json = JSON.stringify({ error })
    expect(json).toContain('"id":"pjt.inspect.operation-unsupported"')
    expect(json).toContain('"operation":"Exec"')
  })

  it("inspect is unaffected when no blueprint declares a command", async () => {
    await declare([{ id: "a", operations: [gitignore("a")] }])
    const result = await Effect.runPromise(inspect({ config: config() }))
    expect(result.hasDrift).toBe(true)
  })
})
