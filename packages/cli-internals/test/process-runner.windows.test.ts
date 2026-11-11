import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { nodeSpawner } from "../src/platform/process-runner.js"

/**
 * Real Windows `.cmd` shims, run only on a Windows host (the `windows` CI job). The shim launches a
 * Node script that prints its argv as JSON and drops a marker file, so a refused input is provable
 * by the absence of the marker.
 */
describe.skipIf(process.platform !== "win32")("nodeSpawner with Windows .cmd shims", () => {
  const makeProject = (): string => {
    const root = mkdtempSync(path.join(tmpdir(), "pjt-win-"))
    const bin = path.join(root, "node_modules", ".bin")
    mkdirSync(bin, { recursive: true })
    writeFileSync(
      path.join(root, "argv-tool.js"),
      'require("node:fs").writeFileSync("started.txt", "1")\nconsole.log(JSON.stringify(process.argv.slice(2)))\n',
    )
    writeFileSync(path.join(bin, "argv-tool.cmd"), '@node "%~dp0\\..\\..\\argv-tool.js" %*\r\n')
    return root
  }
  const run = (program: string, args: readonly string[], cwd: string) =>
    Effect.runPromise(
      Effect.match(nodeSpawner(program, args, cwd), {
        onFailure: (failed) => ({ failed, stdout: "" }),
        onSuccess: (out) => ({ failed: "", stdout: out.stdout }),
      }),
    )

  it("finds a project-local shim and keeps spaces, quotes and metacharacters literal", async () => {
    const root = makeProject()
    const args = ["a b", 'say "hi"', "x&y", "p|q", "(z)", "c^d", "<>", "&&", "$HOME", "*.ts"]
    const result = await run("argv-tool", args, root)
    expect(result.failed).toBe("")
    expect(JSON.parse(result.stdout)).toEqual(args)
  })

  it.each(["%PATH%", "a\nb", "a\rb", "a\0b"])(
    "refuses %j without starting the tool",
    async (bad) => {
      const root = makeProject()
      const result = await run("argv-tool", ["ok", bad], root)
      expect(result.failed).toContain("cannot be passed literally on Windows")
      expect(existsSync(path.join(root, "started.txt"))).toBe(false)
    },
  )

  it("refuses an unsafe program name and an unsafe resolved path without starting anything", async () => {
    const root = makeProject()
    const odd = path.join(root, "node_modules", ".bin", "odd%tool.cmd")
    writeFileSync(odd, '@node "%~dp0\\..\\..\\argv-tool.js" %*\r\n')
    const results = await Promise.all(["odd%tool", odd].map((p) => run(p, [], root)))
    expect(results.map((r) => r.failed.includes("cannot be passed literally"))).toEqual([
      true,
      true,
    ])
    expect(existsSync(path.join(root, "started.txt"))).toBe(false)
  })
})
