import { fork } from "node:child_process"
import { promises as fs } from "node:fs"
import net from "node:net"
import * as os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { computeReadAllowlist, packageNameOf, permissionFlag } from "../src/worker/allowlist.js"
import { planBlueprintFile } from "../src/worker/host.js"
import { stageBlueprintModule } from "../src/worker/stage.js"
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
  // Permission grants and synthetic package-link targets use canonical paths; a temporary directory
  // reached through a symlink (macOS's /var -> /private/var) would add an unrelated lookup to them.
  // Project-root aliases are exercised separately below.
  cwd = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "projitect-test-worker-")))
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

/** The allowlist the parent computes for a `.pjt.ts`, with the staged package graph it points at. */
const allowlistFor = (blueprintFile: string, resolveFrom: readonly string[]) =>
  Effect.runPromise(
    Effect.scoped(
      transpileBlueprintFile({ blueprintFile, full: blueprintFile }).pipe(
        Effect.flatMap(({ moduleFile, imports }) =>
          stageBlueprintModule({ workerEntry, moduleFile, imports, resolveFrom }),
        ),
        Effect.map(({ stageDir }) => ({
          stageDir,
          allowlist: computeReadAllowlist({
            workerEntry,
            blueprintFile,
            stageDir,
            execPath: process.execPath,
          }),
        })),
      ),
    ),
  )

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
    const { allowlist } = await allowlistFor(blueprintFile, [cwd])
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

const ProbeReport = Schema.Struct({
  home: Schema.String,
  ssh: Schema.String,
  projectTree: Schema.String,
  spawn: Schema.String,
  network: Schema.String,
})
type ProbeReport = typeof ProbeReport.Type
const decodeProbeReport = Schema.decodeUnknownSync(ProbeReport)

const probe = async (port: number) => {
  const probeFile = path.join(cwd, "probe.mjs")
  await fs.writeFile(probeFile, probeSource, "utf8")
  return new Promise<ProbeReport>((resolve, reject) => {
    const child = fork(probeFile, [here, String(port)], {
      execArgv: [permissionFlag(process.versions.node), `--allow-fs-read=${probeFile}`],
      env: {},
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    })
    child.on("message", (message) => {
      resolve(decodeProbeReport(message))
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
      expect(result.home).toBe("ERR_ACCESS_DENIED")
      expect(result.ssh).toBe("ERR_ACCESS_DENIED")
      expect(result.projectTree).toBe("ERR_ACCESS_DENIED")
      expect(result.spawn).toBe("ERR_ACCESS_DENIED")
      // Node 22.12–24 document no network permission, so outbound connections are NOT restricted
      // there. A runtime that gains one is expected to deny the connection instead.
      expect(result.network).toBe(nodeMajor < 25 ? "connected" : "ERR_ACCESS_DENIED")
    } finally {
      server.close()
    }
  })
})

describe("planBlueprintFile", () => {
  it("loads a config through a symlinked project root without granting the outer directory", async () => {
    const project = path.join(cwd, "project")
    const alias = path.join(cwd, "alias")
    await fs.mkdir(project)
    await fs.symlink(project, alias)
    await fs.writeFile(
      path.join(project, ".pjt.ts"),
      'export default { _tag: "ProjitectConfig", blueprints: [] }',
    )
    expect(
      await Effect.runPromise(planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: alias })),
    ).toEqual([])
  })

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

  it("roots a blueprint inside directory() at that directory, with no way back up", async () => {
    // The root and the directory each hold a `marker.txt`; the blueprint must see the nested one.
    await fs.mkdir(path.join(cwd, "docs"))
    await fs.writeFile(path.join(cwd, "marker.txt"), "root")
    await fs.writeFile(path.join(cwd, "docs", "marker.txt"), "docs")
    await fs.symlink(cwd, path.join(cwd, "docs", "escape"))
    const planned = await plan("worker-directory.pjt.ts")
    expect(planned).toHaveLength(1)
    expect(planned[0]?.directoryPrefix).toBe("docs")
    const op = planned[0]?.changeSet.operations[0]
    const report: unknown = JSON.parse(op?._tag === "Owned" ? op.content : "{}")
    expect(report).toEqual({
      marker: "docs",
      climbed: "FsPermissionDenied",
      linked: "FsPermissionDenied",
    })
  })

  it.each([
    ["a lexical escape", "worker-directory-escape.pjt.ts"],
    ["a symlinked directory root", "worker-directory.pjt.ts"],
  ])("denies %s before a scoped blueprint reads outside the project", async (_name, name) => {
    const projectRoot = path.join(cwd, "project")
    await fs.mkdir(projectRoot)
    await fs.writeFile(path.join(cwd, "marker.txt"), "outside")
    await fs.symlink(cwd, path.join(projectRoot, "docs"))
    const error = await Effect.runPromise(
      Effect.flip(planBlueprintFile({ blueprintFile: fixture(name), projectRoot })),
    )
    expect(error).toMatchObject({
      _tag: "FsPermissionDenied",
      id: "pjt.fs.permission-denied",
      path: "marker.txt",
    })
  })

  it("carries bytes across the worker boundary exactly, BOM and non-UTF-8 included", async () => {
    const raw = Uint8Array.from([0xef, 0xbb, 0xbf, 0x68, 0xff, 0xfe, 0x00, 0xc3, 0x28, 0x0d, 0x0a])
    await fs.writeFile(path.join(cwd, "raw.bin"), raw)
    await fs.writeFile(path.join(cwd, "other.bin"), raw)
    const planned = await plan("worker-bytes.pjt.ts")
    const op = planned[0]?.changeSet.operations[0]
    const report: unknown = JSON.parse(op?._tag === "Owned" ? op.content : "{}")
    expect(report).toEqual({ bytes: Array.from(raw), denied: "FsPermissionDenied" })
    expect(new Uint8Array(await fs.readFile(path.join(cwd, "copy.bin")))).toEqual(raw)
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

  it("imports symlinked packages whose names share a prefix without reading an unimported sibling", async () => {
    // Node's permission trie loses an exact grant that prefixes a sibling's (`pkg-a` / `pkg-a-b`);
    // the allowlist must repair that without a `pkg-a*` grant that would also cover `pkg-a-private`.
    const modules = path.join(cwd, "node_modules")
    await fs.mkdir(modules, { recursive: true })
    const install = async (name: string, symlinked: boolean) => {
      // `pkg-a` is a symlink (as in pnpm); the others are real directories (as from a registry).
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
    await Promise.all([
      install("pkg-a", true),
      install("pkg-a-b", false),
      install("pkg-a-private", false),
    ])
    const blueprintFile = path.join(cwd, ".pjt.ts")
    await fs.writeFile(
      blueprintFile,
      [
        'import fs from "node:fs"',
        'import { name as a } from "pkg-a"',
        'import { name as b } from "pkg-a-b"',
        "const attempt = (file: string): string => {",
        "  try {",
        "    fs.readFileSync(file)",
        '    return "allowed"',
        "  } catch (error) {",
        '    return error instanceof Error && "code" in error ? String(error.code) : String(error)',
        "  }",
        "}",
        `const reads = [a, b, "pkg-a-private"].map((name) => attempt(${JSON.stringify(modules)} + "/" + name + "/index.js"))`,
        'if (reads.join() !== "ERR_ACCESS_DENIED,ERR_ACCESS_DENIED,ERR_ACCESS_DENIED") throw new Error(reads.join())',
        'export default { _tag: "ProjitectConfig", blueprints: [] }',
      ].join("\n"),
    )
    const { allowlist } = await allowlistFor(blueprintFile, [cwd])
    expect(allowlist.filter((entry) => entry.includes("pkg-a-private"))).toEqual([])
    expect(allowlist.filter((entry) => entry.endsWith("*"))).toEqual([])
    const planned = await Effect.runPromise(
      planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: cwd }),
    )
    expect(planned).toEqual([])
  })

  it("imports scoped, CJS, cyclic, nested-version and optional-dependency packages with their assets", async () => {
    const modules = path.join(cwd, "node_modules")
    const write = async (dir: string, files: Record<string, string>) => {
      await fs.mkdir(dir, { recursive: true })
      await Promise.all(
        Object.entries(files).map(([file, content]) => fs.writeFile(path.join(dir, file), content)),
      )
    }
    const link = async (name: string, files: Record<string, string>) => {
      await write(path.join(cwd, "store", name), files)
      await fs.mkdir(path.dirname(path.join(modules, name)), { recursive: true })
      await fs.symlink(path.join(cwd, "store", name), path.join(modules, name))
    }
    const manifest = (value: Record<string, unknown>) => JSON.stringify(value)
    await link("@sc/lib", {
      "package.json": manifest({ name: "@sc/lib", type: "module", exports: "./index.js" }),
      "index.js":
        'import { readFileSync } from "node:fs"\nexport const asset = readFileSync(new URL("./asset.txt", import.meta.url), "utf8")\n',
      "asset.txt": "scoped-asset",
    })
    await write(path.join(modules, "cjs-lib"), {
      "package.json": manifest({
        name: "cjs-lib",
        main: "index.cjs",
        dependencies: { "cjs-dep": "*" },
      }),
      "index.cjs":
        'const fs = require("node:fs")\nconst path = require("node:path")\nmodule.exports = { asset: fs.readFileSync(path.join(__dirname, "asset.txt"), "utf8"), dep: require("cjs-dep") }\n',
      "asset.txt": "cjs-asset",
    })
    await link("cjs-dep", {
      "package.json": manifest({ name: "cjs-dep", main: "index.js" }),
      "index.js": 'module.exports = "dep"\n',
    })
    await link("cyc-a", {
      "package.json": manifest({
        name: "cyc-a",
        type: "module",
        exports: "./index.js",
        dependencies: { "cyc-b": "*" },
      }),
      "index.js":
        'import { other } from "cyc-b"\nexport const name = "a"\nexport const viaB = () => other()\n',
    })
    await link("cyc-b", {
      "package.json": manifest({
        name: "cyc-b",
        type: "module",
        exports: "./index.js",
        dependencies: { "cyc-a": "*" },
      }),
      "index.js": 'import { name } from "cyc-a"\nexport const other = () => "b>" + name\n',
    })
    await write(path.join(modules, "ver-lib"), {
      "package.json": manifest({
        name: "ver-lib",
        version: "1.0.0",
        type: "module",
        exports: "./index.js",
      }),
      "index.js": 'export default "1"\n',
    })
    await write(path.join(modules, "holder", "node_modules", "ver-lib"), {
      "package.json": manifest({
        name: "ver-lib",
        version: "2.0.0",
        type: "module",
        exports: "./index.js",
      }),
      "index.js": 'export default "2"\n',
    })
    await write(path.join(modules, "holder"), {
      "package.json": manifest({
        name: "holder",
        type: "module",
        exports: "./index.js",
        dependencies: { "ver-lib": "*" },
        optionalDependencies: { "absent-optional": "*" },
      }),
      "index.js":
        'import version from "ver-lib"\nexport const nested = version\nexport const optional = await import("absent-optional").then(() => "present", () => "missing")\n',
    })
    const blueprintFile = path.join(cwd, ".pjt.ts")
    await fs.writeFile(
      blueprintFile,
      [
        'import { asset } from "@sc/lib"',
        'import cjs from "cjs-lib"',
        'import { nested, optional } from "holder"',
        'import { viaB } from "cyc-a"',
        'import verLib from "ver-lib"',
        "const seen = [asset, cjs.asset, cjs.dep, viaB(), nested, optional, verLib].join()",
        'if (seen !== "scoped-asset,cjs-asset,dep,b>a,2,missing,1") throw new Error(seen)',
        'export default { _tag: "ProjitectConfig", blueprints: [] }',
      ].join("\n"),
    )
    expect(
      await Effect.runPromise(planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: cwd })),
    ).toEqual([])
  })

  it("removes the staged package graph when the run ends, however it ends", async () => {
    const staged = async (name: string) => {
      const blueprintFile = fixture(name)
      const stageDirs: string[] = []
      const run = Effect.scoped(
        transpileBlueprintFile({ blueprintFile, full: blueprintFile }).pipe(
          Effect.flatMap(({ moduleFile, imports }) =>
            stageBlueprintModule({ workerEntry, moduleFile, imports, resolveFrom: [cwd] }),
          ),
          Effect.tap(({ stageDir }) =>
            Effect.sync(() => {
              stageDirs.push(stageDir)
            }),
          ),
          Effect.andThen(Effect.fail("stop")),
        ),
      )
      await Effect.runPromise(Effect.flip(run))
      return stageDirs
    }
    const [stageDir] = await staged("worker-denied.pjt.ts")
    expect(stageDir).toBeDefined()
    await expect(fs.access(stageDir ?? "")).rejects.toThrow()
  })

  it("reports a missing .pjt.ts without starting a worker", async () => {
    const error = await Effect.runPromise(
      Effect.flip(planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: cwd })),
    )
    expect(error).toMatchObject({ id: "pjt.config.blueprint-file-not-found" })
  })
})
