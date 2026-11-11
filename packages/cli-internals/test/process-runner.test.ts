import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Exit, Fiber, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Errors } from "@projitect/core"
import type { Permission } from "@projitect/core"
import { isPermitted } from "../src/permissions.js"
import {
  nodeSpawner,
  parseArgv,
  runCommand,
  unsafeWindowsInput,
} from "../src/platform/process-runner.js"
import type { ProcessSpawner } from "../src/platform/process-runner.js"

const exec = (command: string): readonly Permission.Permission[] => [{ kind: "exec", command }]

const fakeSpawner = (
  result: Effect.Effect<{ exitCode: number; stdout: string; stderr: string }, string>,
) => {
  const calls: { program: string; args: readonly string[]; cwd: string }[] = []
  const spawner: ProcessSpawner = (program, args, cwd) => {
    calls.push({ program, args, cwd })
    return result
  }
  return { calls, spawner }
}

const run = (
  permissions: readonly Permission.Permission[],
  command: string,
  spawner: ProcessSpawner,
) => Effect.runPromiseExit(runCommand({ permissions, command, cwd: "/proj", spawner }))

const failureOf = <E>(exit: Exit.Exit<unknown, E>): E | undefined =>
  Exit.isFailure(exit)
    ? Exit.findErrorOption(exit).pipe((o) => (o._tag === "Some" ? o.value : undefined))
    : undefined

describe("runCommand", () => {
  it("returns captured stdout and stderr for a permitted command", async () => {
    const { calls, spawner } = fakeSpawner(
      Effect.succeed({ exitCode: 0, stdout: "out", stderr: "err" }),
    )
    const exit = await run(exec("pnpm lint"), "pnpm lint", spawner)
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ stdout: "out", stderr: "err" })
    expect(calls).toEqual([{ program: "pnpm", args: ["lint"], cwd: "/proj" }])
  })

  it("denies an undeclared command without spawning", async () => {
    const { calls, spawner } = fakeSpawner(Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }))
    const error = failureOf(await run([], "pnpm lint", spawner))
    expect(error).toBeInstanceOf(Errors.CommandNotPermitted)
    expect(calls).toHaveLength(0)
  })

  it("denies a near-miss command", async () => {
    const { calls, spawner } = fakeSpawner(Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }))
    const commands = ["pnpm lint:fix", "pnpm lint ", "pnpm lint && rm -rf /", "pnpm *"]
    const exits = await Promise.all(
      commands.map((command) => run(exec("pnpm lint"), command, spawner)),
    )
    for (const exit of exits) {
      expect(failureOf(exit)).toBeInstanceOf(Errors.CommandNotPermitted)
    }
    expect(calls).toHaveLength(0)
  })

  it("does not treat a glob in the permission as a pattern", async () => {
    const { spawner } = fakeSpawner(Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }))
    const error = failureOf(await run(exec("pnpm *"), "pnpm lint", spawner))
    expect(error).toBeInstanceOf(Errors.CommandNotPermitted)
  })

  it("lets read and write permissions grant nothing for exec", async () => {
    const { calls, spawner } = fakeSpawner(Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }))
    const error = failureOf(
      await run(
        [
          { kind: "read", glob: "**" },
          { kind: "write", glob: "**" },
        ],
        "pnpm lint",
        spawner,
      ),
    )
    expect(error).toBeInstanceOf(Errors.CommandNotPermitted)
    expect(calls).toHaveLength(0)
  })

  it("lets an exec permission grant no file access", () => {
    expect(isPermitted(exec("pnpm lint"), "read", "pnpm lint")).toBe(false)
    expect(isPermitted(exec("**"), "write", "a.txt")).toBe(false)
  })

  it("fails with CommandFailed carrying exit code and output on non-zero exit", async () => {
    const { spawner } = fakeSpawner(Effect.succeed({ exitCode: 2, stdout: "o", stderr: "e" }))
    const error = failureOf(await run(exec("pnpm lint"), "pnpm lint", spawner))
    expect(error).toBeInstanceOf(Errors.CommandFailed)
    expect(error).toMatchObject({ command: "pnpm lint", exitCode: 2, stdout: "o", stderr: "e" })
  })

  it("fails with CommandFailed and no exit code on a spawn failure", async () => {
    const { spawner } = fakeSpawner(Effect.fail("spawn nope ENOENT"))
    const error = failureOf(await run(exec("nope"), "nope", spawner))
    expect(error).toBeInstanceOf(Errors.CommandFailed)
    expect(error).toMatchObject({ command: "nope", cause: "spawn nope ENOENT" })
    expect(error).not.toHaveProperty("exitCode", expect.anything())
  })

  it("serialises both errors to JSON", () => {
    const failed = new Errors.CommandFailed({
      id: "pjt.exec.command-failed",
      command: "x",
      exitCode: 1,
      stdout: "o",
      stderr: "e",
      message: "m",
    })
    const denied = new Errors.CommandNotPermitted({
      id: "pjt.exec.command-not-permitted",
      command: "x",
      message: "m",
    })
    expect(Schema.encodeSync(Errors.CommandFailed)(failed)).toMatchObject({
      _tag: "CommandFailed",
      exitCode: 1,
      stdout: "o",
    })
    expect(Schema.encodeSync(Errors.CommandNotPermitted)(denied)).toMatchObject({
      _tag: "CommandNotPermitted",
      command: "x",
    })
  })
})

describe("argv contract", () => {
  it("splits on unquoted whitespace and keeps quoted arguments whole", () => {
    expect(parseArgv("prettier --check 'src/a b/**/*.ts' \"x y\"  z")).toEqual(
      Option.some(["prettier", "--check", "src/a b/**/*.ts", "x y", "z"]),
    )
    expect(parseArgv("echo ''")).toEqual(Option.some(["echo", ""]))
  })

  it("rejects empty commands and unterminated quotes", () => {
    for (const command of ["", "   ", "echo 'oops", '"']) {
      expect(Option.isNone(parseArgv(command))).toBe(true)
    }
  })

  it("passes quoted arguments to the spawner and permits only the raw string", async () => {
    const command = "fmt 'a b' c"
    const { calls, spawner } = fakeSpawner(Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }))
    await run(exec(command), command, spawner)
    expect(calls).toEqual([{ program: "fmt", args: ["a b", "c"], cwd: "/proj" }])
    const denied = failureOf(await run(exec(command), "fmt a b c", spawner))
    expect(denied).toBeInstanceOf(Errors.CommandNotPermitted)
  })

  it("fails with CommandFailed, without spawning, on unsupported syntax", async () => {
    const { calls, spawner } = fakeSpawner(Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }))
    const error = failureOf(await run(exec("echo 'oops"), "echo 'oops", spawner))
    expect(error).toBeInstanceOf(Errors.CommandFailed)
    expect(calls).toHaveLength(0)
  })
})

describe("nodeSpawner cancellation", () => {
  it("kills the owned child when the fiber is interrupted", async () => {
    const pidFile = path.join(mkdtempSync(path.join(tmpdir(), "pjt-runner-")), "pid")
    const script = `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 60000)`
    const fiber = Effect.runFork(nodeSpawner("node", ["-e", script], tmpdir()))
    const pid = await new Promise<number>((resolve, reject) => {
      const started = Date.now()
      const poll = () => {
        try {
          resolve(Number(readFileSync(pidFile, "utf8")))
        } catch {
          if (Date.now() - started > 10_000) {
            reject(new Error("child never started"))
            return
          }
          setTimeout(poll, 20)
        }
      }
      poll()
    })
    await Effect.runPromise(Fiber.interrupt(fiber))
    await new Promise((resolve) => {
      setTimeout(resolve, 200)
    })
    expect(() => process.kill(pid, 0)).toThrow()
  })
})

describe.skipIf(process.platform === "win32")(
  "nodeSpawner tool resolution (real executables)",
  () => {
    const makeTool = (dir: string, name: string, body: string): string => {
      mkdirSync(dir, { recursive: true })
      const file = path.join(dir, name)
      writeFileSync(file, `#!/usr/bin/env node\n${body}\n`)
      chmodSync(file, 0o755)
      return file
    }
    const makeProject = (tool: string, body: string): string => {
      const root = mkdtempSync(path.join(tmpdir(), "pjt-resolve-"))
      makeTool(path.join(root, "node_modules", ".bin"), tool, body)
      return root
    }
    const runReal = (command: string, cwd: string) =>
      Effect.runPromise(
        runCommand({ permissions: exec(command), command, cwd, spawner: nodeSpawner }),
      )
    const stdoutOf = async (command: string, cwd: string): Promise<string> => {
      const out = await runReal(command, cwd)
      return out.stdout.trim()
    }

    it("runs a project-only tool with the caller PATH excluding it, from any working directory", async () => {
      const root = makeProject("local-only", 'console.log("local:" + process.cwd())')
      const before = process.cwd()
      const out = await runReal("local-only", root)
      expect(out.stdout.trim()).toBe(`local:${realpathSync(root)}`)
      expect(process.cwd()).toBe(before)
      expect((process.env["PATH"] ?? "").includes(root)).toBe(false)
    })

    it("prefers the project-local tool over a global one of the same name", async () => {
      const root = makeProject("dup-tool", 'console.log("local")')
      const globalDir = path.join(mkdtempSync(path.join(tmpdir(), "pjt-global-")), "bin")
      makeTool(globalDir, "dup-tool", 'console.log("global")')
      const original = process.env["PATH"]
      process.env["PATH"] = `${globalDir}${path.delimiter}${original ?? ""}`
      try {
        expect(await stdoutOf("dup-tool", root)).toBe("local")
      } finally {
        process.env["PATH"] = original
      }
    })

    it("falls back to the system PATH when there is no local match", async () => {
      const root = mkdtempSync(path.join(tmpdir(), "pjt-resolve-"))
      expect(await stdoutOf("node --version", root)).toMatch(/^v\d+/u)
    })

    it("runs explicit relative (against the project root) and absolute paths as given", async () => {
      const root = mkdtempSync(path.join(tmpdir(), "pjt-resolve-"))
      const tool = makeTool(path.join(root, "scripts"), "hello", 'console.log("explicit")')
      expect(await stdoutOf("./scripts/hello", root)).toBe("explicit")
      expect(await stdoutOf(tool, root)).toBe("explicit")
    })

    it("fails with command-failed naming the tool and where it looked", async () => {
      const root = mkdtempSync(path.join(tmpdir(), "pjt-resolve-"))
      const exit = await Effect.runPromiseExit(
        runCommand({
          permissions: exec("no-such-tool-xyz"),
          command: "no-such-tool-xyz",
          cwd: root,
          spawner: nodeSpawner,
        }),
      )
      const failure = failureOf(exit)
      expect(failure?.id).toBe("pjt.exec.command-failed")
      const message = failure?.message ?? ""
      expect(message).toContain("no-such-tool-xyz")
      expect(message).toContain(path.join(root, "node_modules", ".bin"))
    })

    it("refuses a denied command before any lookup or spawn", async () => {
      const root = makeProject("denied-tool", 'console.log("ran")')
      let calls = 0
      const spy: ProcessSpawner = (...args) => {
        calls = calls + 1
        return nodeSpawner(...args)
      }
      const exit = await Effect.runPromiseExit(
        runCommand({ permissions: exec("other"), command: "denied-tool", cwd: root, spawner: spy }),
      )
      expect(failureOf(exit)?.id).toBe("pjt.exec.command-not-permitted")
      expect(calls).toBe(0)
    })

    it("passes operators, variables and globs to the tool as literal arguments", async () => {
      const root = makeProject("argv-tool", "console.log(JSON.stringify(process.argv.slice(2)))")
      const out = await runReal("argv-tool a && b ; $HOME *.ts", root)
      expect(JSON.parse(out.stdout)).toEqual(["a", "&&", "b", ";", "$HOME", "*.ts"])
    })

    it("resolves relative and empty PATH entries against the project root, as the child would", async () => {
      const root = mkdtempSync(path.join(tmpdir(), "pjt-resolve-"))
      makeTool(path.join(root, "review-relative-bin"), "rel-tool", 'console.log("relative")')
      makeTool(root, "empty-entry-tool", 'console.log("empty")')
      const original = process.env["PATH"]
      try {
        process.env["PATH"] = `review-relative-bin${path.delimiter}${original ?? ""}`
        expect(await stdoutOf("rel-tool", root)).toBe("relative")
        process.env["PATH"] = `${path.delimiter}${original ?? ""}`
        expect(await stdoutOf("empty-entry-tool", root)).toBe("empty")
      } finally {
        process.env["PATH"] = original
      }
    })

    it("keeps two projects' tools and the process PATH apart", async () => {
      const one = makeProject("which-project", 'console.log("one")')
      const two = makeProject("which-project", 'console.log("two")')
      const pathBefore = process.env["PATH"]
      const [a, b] = await Promise.all([
        runReal("which-project", one),
        runReal("which-project", two),
      ])
      expect([a.stdout.trim(), b.stdout.trim()]).toEqual(["one", "two"])
      expect(process.env["PATH"]).toBe(pathBefore)
    })
  },
)

describe("unsafeWindowsInput", () => {
  it("flags percent, CR, LF and NUL in any value and passes spaces, quotes and metacharacters", () => {
    expect(unsafeWindowsInput(["tool", "a b", 'say "hi"', "x&y", "p|q", "(z)", "c^d", "<>"])).toBe(
      undefined,
    )
    for (const bad of ["%PATH%", "a\nb", "a\rb", "a\0b"]) {
      expect(unsafeWindowsInput(["tool", "ok", bad])).toBe(bad)
    }
    expect(unsafeWindowsInput(["pct%tool"])).toBe("pct%tool")
  })
})
