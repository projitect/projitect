import { fork } from "node:child_process"
import { promises as fs } from "node:fs"
import net from "node:net"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { computeReadAllowlist, packageNameOf, permissionFlag } from "../src/worker/allowlist.js"
import { planBlueprintFile } from "../src/worker/host.js"
import { transpileBlueprintFile } from "../src/worker/transpile.js"

/**
 * The confined worker: which flag and allowlist it is started with, what Node's permission model
 * refuses inside it, and how its failures reach the CLI. The permission model is accident
 * prevention, not a boundary against hostile code — these tests only pin the accidents.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.join(here, "fixtures", name)
const workerEntry = path.join(here, "../dist/worker/child-entry.js")
const nodeMajor = Number(process.versions.node.split(".")[0])

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-worker-"))
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

const plan = (name: string, timeoutMs?: number) =>
  Effect.runPromise(
    planBlueprintFile({
      blueprintFile: fixture(name),
      projectRoot: cwd,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    }),
  )

const planError = (name: string, timeoutMs?: number) =>
  Effect.runPromise(
    Effect.flip(
      planBlueprintFile({
        blueprintFile: fixture(name),
        projectRoot: cwd,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      }),
    ),
  )

describe("permissionFlag", () => {
  it.each([
    ["22.12.0", "--experimental-permission"],
    ["22.12.9", "--experimental-permission"],
    ["22.13.0", "--permission"],
    ["22.23.3", "--permission"],
    ["23.4.0", "--experimental-permission"],
    ["23.5.0", "--permission"],
    ["24.0.0", "--permission"],
  ])("Node %s uses %s", (version, flag) => {
    expect(permissionFlag(version)).toBe(flag)
  })
})

describe("packageNameOf", () => {
  it("keeps the package name of bare specifiers and drops everything else", () => {
    expect(packageNameOf("effect/Effect")).toMatchObject({ value: "effect" })
    expect(packageNameOf("@projitect/blueprint-gitignore/x")).toMatchObject({
      value: "@projitect/blueprint-gitignore",
    })
    expect(packageNameOf("./local.js")._tag).toBe("None")
    expect(packageNameOf("node:fs")._tag).toBe("None")
    expect(packageNameOf("fs")._tag).toBe("None")
  })
})

describe("read allowlist", () => {
  it("lists the worker's packages and the .pjt.ts, never the project tree or $HOME", async () => {
    const blueprintFile = fixture("worker-denied.pjt.ts")
    const allowlist = await Effect.runPromise(
      Effect.scoped(
        transpileBlueprintFile({ blueprintFile, full: blueprintFile }).pipe(
          Effect.map(({ moduleFile, imports }) =>
            computeReadAllowlist({
              workerEntry,
              blueprintFile,
              moduleFile,
              imports,
              projectRoot: cwd,
              execPath: process.execPath,
            }),
          ),
        ),
      ),
    )
    expect(allowlist).toContain(blueprintFile)
    expect(allowlist.some((entry) => /[/\\]effect$/u.test(entry))).toBe(true)
    expect(allowlist.some((entry) => /[/\\]@projitect[/\\]core$/u.test(entry))).toBe(true)
    for (const unrelated of [cwd, os.homedir(), path.join(os.homedir(), ".ssh"), here]) {
      expect(allowlist).not.toContain(unrelated)
    }
    // Nothing in the list is $HOME itself or an ancestor of it.
    expect(
      allowlist.filter(
        (entry) => entry === os.homedir() || os.homedir().startsWith(`${entry}${path.sep}`),
      ),
    ).toEqual([])
  })
})

// Plain JavaScript run under `node --permission`; reports the Node error code of each forbidden action.
const probeSource = `import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import { spawnSync } from "node:child_process"

// Runs inside \`node --permission\`; reports the Node error code of each forbidden action.
const code = (action) => {
  try {
    action()
    return "allowed"
  } catch (e) {
    return e.code ?? String(e)
  }
}
const [probeDir, port] = process.argv.slice(2)
const network = await new Promise((resolve) => {
  try {
    const socket = net.connect(Number(port), "127.0.0.1", () => {
      socket.destroy()
      resolve("connected")
    })
    socket.on("error", (e) => resolve(e.code ?? String(e)))
  } catch (e) {
    resolve(e.code ?? String(e))
  }
})
process.send({
  home: code(() => fs.readdirSync(os.homedir())),
  ssh: code(() => fs.readdirSync(\`\${os.homedir()}/.ssh\`)),
  projectTree: code(() => fs.readdirSync(probeDir)),
  spawn: code(() => {
    const result = spawnSync("sh", ["-c", "true"])
    if (result.error) throw result.error
  }),
  network,
})
process.exit(0)
`

const probe = async (port: number) => {
  const probeFile = path.join(cwd, "probe.mjs")
  await fs.writeFile(probeFile, probeSource, "utf8")
  return new Promise<Record<string, string>>((resolve, reject) => {
    const child = fork(probeFile, [here, String(port)], {
      execArgv: [permissionFlag(process.versions.node), `--allow-fs-read=${probeFile}`],
      env: {},
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    })
    child.on("message", (message) => {
      resolve(message as Record<string, string>)
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      reject(new Error(`probe exited with ${String(code)}`))
    })
  })
}

describe("Node permission model inside the worker flags", () => {
  it("refuses fs reads outside the allowlist and process spawning with Node's own error", async () => {
    const server = net.createServer((socket) => socket.destroy())
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    const port = typeof address === "object" && address !== null ? address.port : 0
    try {
      const result = await probe(port)
      expect(result["home"]).toBe("ERR_ACCESS_DENIED")
      expect(result["ssh"]).toBe("ERR_ACCESS_DENIED")
      expect(result["projectTree"]).toBe("ERR_ACCESS_DENIED")
      expect(result["spawn"]).toBe("ERR_ACCESS_DENIED")
      // Node 22.12–24 document no network permission, so outbound connections are NOT restricted
      // there. A runtime that gains one is expected to deny the connection instead.
      expect(result["network"]).toBe(nodeMajor < 25 ? "connected" : "ERR_ACCESS_DENIED")
    } finally {
      server.close()
    }
  })
})

describe("planBlueprintFile", () => {
  it("runs blueprint plans in the confined worker, where fs and process access are denied", async () => {
    const planned = await plan("worker-sandbox.pjt.ts")
    expect(planned).toHaveLength(1)
    const [entry] = planned
    expect(entry?.id).toBe("pjt:test:worker-sandbox")
    const op = entry?.changeSet.operations[0]
    expect(op).toMatchObject({ _tag: "Owned", path: "probe.json" })
    const report: unknown = JSON.parse(op?._tag === "Owned" ? op.content : "{}")
    expect(report).toEqual({
      home: "ERR_ACCESS_DENIED",
      projectTree: "ERR_ACCESS_DENIED",
      spawn: "ERR_ACCESS_DENIED",
    })
  })

  it("delivers a permission-denied from the parent-side gate as the same typed error", async () => {
    const error = await planError("worker-denied.pjt.ts")
    expect(error).toMatchObject({
      _tag: "FsPermissionDenied",
      id: "pjt.fs.permission-denied",
      blueprintId: "pjt:test:worker-denied",
      operation: "read",
      path: "package.json",
    })
  })

  it("maps a crashing worker to pjt.worker.crashed", async () => {
    expect(await planError("worker-crash.pjt.ts")).toMatchObject({
      _tag: "WorkerCrashed",
      id: "pjt.worker.crashed",
      exitCode: 3,
    })
  })

  it("maps a worker that quits before returning a plan to pjt.worker.exited-early", async () => {
    expect(await planError("worker-early.pjt.ts")).toMatchObject({
      _tag: "WorkerExitedEarly",
      id: "pjt.worker.exited-early",
    })
  })

  it("kills a hung worker and reports pjt.worker.timed-out", async () => {
    expect(await planError("worker-hang.pjt.ts", 1500)).toMatchObject({
      _tag: "WorkerTimedOut",
      id: "pjt.worker.timed-out",
      timeoutMs: 1500,
    })
  })

  it("imports symlinked packages whose names share a prefix", async () => {
    // Node's permission trie loses an exact grant that prefixes a sibling's (`pkg-a` / `pkg-a-b`).
    const modules = path.join(cwd, "node_modules")
    await fs.mkdir(modules, { recursive: true })
    const install = async (name: string, symlinked: boolean) => {
      // `pkg-a` is a symlink (as in pnpm); `pkg-a-b` is a real directory (as from a registry).
      const real = path.join(cwd, symlinked ? "store" : "node_modules", name)
      await fs.mkdir(real, { recursive: true })
      await fs.writeFile(
        path.join(real, "package.json"),
        JSON.stringify({ name, type: "module", exports: "./index.js" }),
      )
      await fs.writeFile(path.join(real, "index.js"), `export const name = "${name}"\n`)
      if (symlinked) {
        await fs.symlink(real, path.join(modules, name))
      }
    }
    await Promise.all([install("pkg-a", true), install("pkg-a-b", false)])
    await fs.writeFile(
      path.join(cwd, ".pjt.ts"),
      [
        'import { name as a } from "pkg-a"',
        'import { name as b } from "pkg-a-b"',
        'export default { _tag: "ProjitectConfig", blueprints: [], config: { a, b } }',
      ].join("\n"),
    )
    const planned = await Effect.runPromise(
      planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: cwd }),
    )
    expect(planned).toEqual([])
  })

  it("reports a missing .pjt.ts without starting a worker", async () => {
    const error = await Effect.runPromise(
      Effect.flip(planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: cwd })),
    )
    expect(error).toMatchObject({ id: "pjt.config.blueprint-file-not-found" })
  })
})
