import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Errors, ProjitectConfig } from "@projitect/core"
import { add } from "../src/commands/add.js"
import { detect, installDev } from "../src/pm.js"
import type * as Pm from "../src/pm.js"

vi.mock("../src/pm.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Pm>()),
  detect: vi.fn(),
  installDev: vi.fn(),
}))

let projectRoot: string

const config = () => ProjitectConfig.resolve({ projectRoot, blueprintFile: ".pjt.ts" })
const run = (pkg: string) =>
  Effect.runPromise(Effect.flip(add({ config: config(), pkg, strategy: { _tag: "All" } })))

const installPackage = async (name: string, manifest: object) => {
  const directory = path.join(projectRoot, "node_modules", name)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify(manifest))
}

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pjt-add-spec-"))
  vi.mocked(detect).mockReturnValue(Effect.succeed("pnpm"))
  vi.mocked(installDev).mockReturnValue(Effect.void)
})

afterEach(async () => {
  vi.clearAllMocks()
  await fs.rm(projectRoot, { recursive: true, force: true })
})

describe("pjt add with a package spec", () => {
  it.each(["../x", "npm:@acme/plain@1", "alias@npm:@acme/plain@1", "file:../x", "workspace:*"])(
    "rejects %s before the package manager runs",
    async (spec) => {
      const error = await run(spec)
      expect(error).toBeInstanceOf(Errors.AddSpecUnsupported)
      expect(detect).not.toHaveBeenCalled()
      expect(installDev).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["@acme/plain", "@acme/plain"],
    ["@acme/plain@1.2.3", "@acme/plain"],
    ["plain@^1", "plain"],
  ])("installs %s with the full spec and names %s when metadata is missing", async (spec, name) => {
    await installPackage(name, { name })
    const error = await run(spec)
    expect(installDev).toHaveBeenCalledWith(expect.objectContaining({ pkg: spec }))
    expect(error).toBeInstanceOf(Errors.AddMetadataMissing)
    expect(error).toMatchObject({ pkg: name })
    expect(error.message.startsWith(`${name} was installed`)).toBe(true)
  })

  it("reads metadata by name for a versioned spec", async () => {
    await installPackage("@acme/set", {
      projitect: { type: "blueprint", import: 'import { x } from "@acme/set"', call: "x()" },
    })
    await fs.writeFile(
      path.join(projectRoot, ".pjt.ts"),
      "// pjt:imports start\n// pjt:imports end\n// pjt:blueprints start\n// pjt:blueprints end\n",
    )
    const result = await Effect.runPromise(
      add({ config: config(), pkg: "@acme/set@1.0.1", strategy: { _tag: "All" } }),
    )
    expect(installDev).toHaveBeenCalledWith(expect.objectContaining({ pkg: "@acme/set@1.0.1" }))
    expect(result.pkg).toBe("@acme/set")
    expect(await fs.readFile(path.join(projectRoot, ".pjt.ts"), "utf8")).toContain("x()")
  })
})
