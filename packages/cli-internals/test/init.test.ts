import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { Cause, Effect, Exit, Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Errors, ProjitectConfig } from "@projitect/core"
import { init } from "../src/commands/init.js"
import { remodel } from "../src/commands/remodel.js"
import { installDev, installProject } from "../src/pm.js"
import type * as Pm from "../src/pm.js"

vi.mock("../src/commands/remodel.js", () => ({ remodel: vi.fn() }))
vi.mock("../src/pm.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Pm>()),
  installDev: vi.fn(),
  installProject: vi.fn(),
}))

let projectRoot: string
const manifest = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String }))(
  createRequire(import.meta.url)("../package.json"),
)

const installed = async (name: string) => {
  const directory = path.join(projectRoot, "node_modules", name)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({ name }))
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv("npm_config_user_agent", "pnpm/10.33.4 npm/? node/v22.12.0")
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pjt-init-test-"))
  await fs.mkdir(path.join(projectRoot, ".git"))
  await fs.writeFile(path.join(projectRoot, "package.json"), '{"name":"init-test"}\n')
  vi.mocked(installProject).mockReturnValue(Effect.void)
  vi.mocked(installDev).mockImplementation(({ pkg }) =>
    Effect.promise(() =>
      installed(pkg.startsWith("@projitect/cli@") ? "@projitect/cli" : "effect"),
    ),
  )
  vi.mocked(remodel).mockImplementation(() =>
    Effect.promise(async () => {
      // The real remodel imports this file; both imports must already resolve locally.
      await fs.access(path.join(projectRoot, "node_modules/@projitect/cli/package.json"))
      await fs.access(path.join(projectRoot, "node_modules/effect/package.json"))
      await fs.access(path.join(projectRoot, ".pjt.ts"))
      return { written: [], removed: [], ran: [] }
    }),
  )
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await fs.rm(projectRoot, { recursive: true, force: true })
})

const config = () => ProjitectConfig.resolve({ projectRoot })

describe("init bootstrap dependencies", () => {
  it("installs the CLI and Effect before loading the generated configuration", async () => {
    const result = await Effect.runPromise(init({ config: config() }))
    expect(result.seededBlueprintFile).toBe(true)
    expect(installDev).toHaveBeenCalledWith({
      projectRoot,
      pm: "pnpm",
      pkg: `@projitect/cli@${manifest.version}`,
    })
    expect(installDev).toHaveBeenCalledWith({ projectRoot, pm: "pnpm", pkg: "effect@4.0.0-rc.111" })
    expect(remodel).toHaveBeenCalledOnce()
    expect(installProject).toHaveBeenCalledWith({ projectRoot, pm: "pnpm" })
    expect(vi.mocked(installProject).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(remodel).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it("reuses both local dependencies without invoking a package manager", async () => {
    await installed("@projitect/cli")
    await installed("effect")
    await Effect.runPromise(init({ config: config() }))
    expect(installDev).not.toHaveBeenCalled()
    expect(installProject).not.toHaveBeenCalled()
    expect(remodel).toHaveBeenCalledOnce()
  })

  it("preserves existing config and returns a typed install failure before loading it", async () => {
    const source = "// existing configuration must survive an install failure\n"
    await fs.writeFile(path.join(projectRoot, ".pjt.ts"), source)
    vi.mocked(installDev).mockReturnValueOnce(
      Effect.fail(
        new Errors.PmInstallFailed({
          id: "pjt.pm.install-failed",
          packageManager: "pnpm",
          pkg: "@projitect/cli",
          cause: "registry unavailable",
          message: "Failed to install CLI",
        }),
      ),
    )
    const result = await Effect.runPromiseExit(init({ config: config() }))
    expect(Exit.isFailure(result) ? Cause.squash(result.cause) : undefined).toBeInstanceOf(
      Errors.PmInstallFailed,
    )
    expect(await fs.readFile(path.join(projectRoot, ".pjt.ts"), "utf8")).toBe(source)
    expect(remodel).not.toHaveBeenCalled()
  })

  it("keeps prerequisite refusal ahead of any dependency installation", async () => {
    await fs.rm(path.join(projectRoot, ".git"), { recursive: true })
    const result = await Effect.runPromiseExit(init({ config: config() }))
    expect(Exit.isFailure(result) ? Cause.squash(result.cause) : undefined).toBeInstanceOf(
      Errors.InitGitMissing,
    )
    expect(installDev).not.toHaveBeenCalled()
    expect(remodel).not.toHaveBeenCalled()
  })

  it("reports a final lockfile synchronization failure after applying managed files", async () => {
    vi.mocked(installProject).mockReturnValueOnce(
      Effect.fail(
        new Errors.PmInstallFailed({
          id: "pjt.pm.install-failed",
          packageManager: "pnpm",
          pkg: "project dependencies",
          cause: "registry unavailable",
          message: "Failed to synchronize project dependencies",
        }),
      ),
    )
    const result = await Effect.runPromiseExit(init({ config: config() }))
    expect(Exit.isFailure(result) ? Cause.squash(result.cause) : undefined).toBeInstanceOf(
      Errors.PmInstallFailed,
    )
    expect(remodel).toHaveBeenCalledOnce()
    expect(await fs.readFile(path.join(projectRoot, ".pjt.ts"), "utf8")).toContain(
      'from "@projitect/cli"',
    )
  })
})
