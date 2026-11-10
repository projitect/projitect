import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect, Exit, Option } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjitectConfig } from "@projitect/core"
import { build } from "../src/commands/build.js"
import { NodePlatformLive } from "../src/platform/index.js"

describe("destructive build preflight", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "projitect-build-preflight-"))
    execFileSync("git", ["init", "-q"], { cwd: root })
    // Everything is ignored: clean git does not imply these files are recoverable.
    await fs.writeFile(path.join(root, ".gitignore"), "*\n")
    await fs.writeFile(path.join(root, "sentinel.txt"), "irreplaceable ignored content")
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const run = (
    overrides: { yes?: boolean; interactive?: boolean; force?: boolean; forceDirty?: boolean } = {},
  ) =>
    Effect.runPromiseExit(
      build({
        config: ProjitectConfig.resolve({ projectRoot: root }),
        force: true,
        forceDirty: false,
        yes: true,
        interactive: false,
        ...overrides,
      }).pipe(Effect.provide(NodePlatformLive)),
    )

  const writeConfig = (source: string) => fs.writeFile(path.join(root, ".pjt.ts"), source)
  const expectSentinel = () =>
    expect(fs.readFile(path.join(root, "sentinel.txt"), "utf8")).resolves.toBe(
      "irreplaceable ignored content",
    )
  const errorOf = <E>(exit: Exit.Exit<unknown, E>) =>
    Exit.isFailure(exit) ? Option.getOrUndefined(Exit.findErrorOption(exit)) : undefined

  it("keeps ignored content when the config is missing", async () => {
    expect(errorOf(await run())).toMatchObject({ id: "pjt.config.blueprint-file-not-found" })
    await expectSentinel()
  })

  it("keeps ignored content when importing the config throws", async () => {
    await writeConfig('throw new Error("broken config")')
    expect(errorOf(await run())).toMatchObject({ id: "pjt.loader.import-failed" })
    await expectSentinel()
  })

  it.each([
    "null",
    "{}",
    '{ _tag: "ProjitectConfig" }',
    '{ _tag: "ProjitectConfig", blueprints: null }',
    '{ _tag: "ProjitectConfig", blueprints: [null] }',
    '{ _tag: "ProjitectConfig", blueprints: [,] }',
    '{ _tag: "ProjitectConfig", blueprints: [{ _tag: "Directory", name: "src", children: [null] }] }',
    '{ _tag: "ProjitectConfig", blueprints: [{ id: "a", version: "1", permissions: [], plan: null }] }',
    '{ _tag: "ProjitectConfig", blueprints: [], config: null }',
  ])("rejects a structurally invalid config before deletion: %s", async (value) => {
    await writeConfig(`export default ${value}`)
    expect(errorOf(await run())).toMatchObject({ id: "pjt.loader.invalid-default-export" })
    await expectSentinel()
  })

  it("rejects a cyclic literal directory tree before deletion", async () => {
    await writeConfig(
      'const children = []; children.push({ _tag: "Directory", name: "src", children }); export default { _tag: "ProjitectConfig", blueprints: children }',
    )
    expect(errorOf(await run())).toMatchObject({ id: "pjt.loader.invalid-default-export" })
    await expectSentinel()
  })

  it("requires --yes on non-interactive input before even importing the config", async () => {
    await writeConfig('throw new Error("must not import")')
    expect(errorOf(await run({ yes: false }))).toMatchObject({
      id: "pjt.apply.confirmation-required",
    })
    await expectSentinel()
  })

  it("imports once, evaluates an Effect tree after deletion, and rebuilds fresh", async () => {
    await fs.mkdir(path.join(root, "node_modules"))
    const counter = path.join(root, "node_modules", "import-count")
    const sentinel = path.join(root, "sentinel.txt")
    await writeConfig(`
      import { Effect } from ${JSON.stringify(import.meta.resolve("effect"))}
      import { appendFileSync, existsSync } from "node:fs"
      appendFileSync(${JSON.stringify(counter)}, "imported\\n")
      export default { _tag: "ProjitectConfig", blueprints: Effect.sync(() => [{
        id: "fresh", version: "1.0.0", permissions: [{ kind: "write", glob: "fresh.txt" }],
        plan: Effect.sync(() => ({ operations: [{ _tag: "Owned", ownerId: "fresh", path: "fresh.txt",
          content: existsSync(${JSON.stringify(sentinel)}) ? "stale" : "fresh" }] }))
      }]) }
    `)
    expect(Exit.isSuccess(await run())).toBe(true)
    await expect(fs.readFile(counter, "utf8")).resolves.toBe("imported\n")
    await expect(fs.readFile(path.join(root, "fresh.txt"), "utf8")).resolves.toBe("fresh")
    await expect(fs.access(sentinel)).rejects.toThrow()
  })

  it("still requires --force", async () => {
    expect(errorOf(await run({ force: false }))).toMatchObject({ id: "pjt.apply.dirty-git" })
    await expectSentinel()
  })

  it("still requires a git repository", async () => {
    await fs.rm(path.join(root, ".git"), { recursive: true })
    expect(errorOf(await run())).toMatchObject({ id: "pjt.git.not-a-repo" })
    await expectSentinel()
  })

  it("still rejects a dirty tree unless explicitly overridden", async () => {
    await fs.writeFile(path.join(root, ".gitignore"), "sentinel.txt\n")
    await writeConfig('export default { _tag: "ProjitectConfig", blueprints: [] }')
    expect(errorOf(await run())).toMatchObject({ id: "pjt.apply.dirty-git" })
    await expectSentinel()
    expect(Exit.isSuccess(await run({ forceDirty: true }))).toBe(true)
    await expect(fs.access(path.join(root, "sentinel.txt"))).rejects.toThrow()
  })
})
