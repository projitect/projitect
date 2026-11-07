import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { markdownSnippets } from "@projitect/blueprint-markdown"
import type { Blueprint, PjtLock } from "@projitect/core"
import { diffPlan } from "../src/differ.js"
import { applyPlan } from "../src/applier.js"
import { readLockfile, writeLockfile } from "../src/lockfile.js"
import { buildPlan, diffLockfile } from "../src/plan.js"
import { applyRemovals } from "../src/remover.js"

/**
 * End-to-end lifecycle for `@projitect/blueprint-markdown` in a clean temporary project:
 * install → add a second snippet → remodel (twice) → package upgrade → inspect → remodel →
 * hand-edit → inspect → remodel → swap → remove.
 *
 * `remodelTree` / `inspectTree` run the same pipeline as the `remodel` / `inspect` commands
 * (build the plan, diff the lockfile, apply, remove, write the lockfile) minus the `.pjt.ts`
 * import, so each step can hand in a blueprint tree directly. `hasDrift` is exactly what the
 * `pjt inspect` binary turns into exit code 1.
 *
 * The invariant checked after every step: stripping the managed regions out of a file leaves
 * exactly the text a human put there.
 */

const ROOT = path.join(os.tmpdir(), "projitect-test-markdown-lifecycle")

const AGENTS_SEED = "# Agent guide\n\nHand-written intro.\n"
const README_SEED = "# My project\n\nHand-written readme.\n\nFooter paragraph.\n"

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(`${ROOT}-`)
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

const readFile = (relative: string, root = cwd) => fs.readFile(path.join(root, relative), "utf8")
const writeFile = (relative: string, content: string, root = cwd) =>
  fs
    .mkdir(path.dirname(path.join(root, relative)), { recursive: true })
    .then(() => fs.writeFile(path.join(root, relative), content, "utf8"))
const exists = (relative: string) =>
  fs.access(path.join(cwd, relative)).then(
    () => true,
    () => false,
  )

const remodelTree = (tree: readonly Blueprint.Blueprint[], root = cwd) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { plan, byBlueprint } = yield* buildPlan({ tree, projectRoot: root })
      const previous = yield* readLockfile({ projectRoot: root })
      const { removals } = diffLockfile({ previous, current: byBlueprint })
      const written = yield* applyPlan({ plan, projectRoot: root })
      const removed = yield* applyRemovals({ removals, projectRoot: root })
      yield* writeLockfile({ projectRoot: root, lock: { version: 1, blueprints: byBlueprint } })
      return { written, removed }
    }),
  )

const inspectTree = (tree: readonly Blueprint.Blueprint[]) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { plan, byBlueprint } = yield* buildPlan({ tree, projectRoot: cwd })
      const previous = yield* readLockfile({ projectRoot: cwd })
      const { removals, upgrades } = diffLockfile({ previous, current: byBlueprint })
      const diff = yield* diffPlan({ plan, projectRoot: cwd })
      return { hasDrift: diff.hasDrift || removals.length > 0, files: diff.files, upgrades }
    }),
  )

const hasDrift = (tree: readonly Blueprint.Blueprint[]) =>
  inspectTree(tree).then((report) => report.hasDrift)

const written = (tree: readonly Blueprint.Blueprint[]) =>
  remodelTree(tree).then((result) => result.written)

const lockEntry = async (id: string): Promise<PjtLock.BlueprintLockEntry | undefined> => {
  const lock = await Effect.runPromise(readLockfile({ projectRoot: cwd }))
  return lock?.blueprints[id]
}

/** The file with every `<!-- pjt:… start -->` … `<!-- pjt:… end -->` block removed. */
const unmanaged = (text: string): string =>
  text.replaceAll(/^<!-- pjt:\S+ start -->\n[\S\s]*?^<!-- pjt:\S+ end -->\n/gmu, "")

const region = (text: string, ownerId: string): string => {
  const start = `<!-- ${ownerId} start -->\n`
  const from = text.indexOf(start)
  const to = text.indexOf(`<!-- ${ownerId} end -->\n`)
  return from === -1 || to === -1 ? "" : text.slice(from, to + `<!-- ${ownerId} end -->\n`.length)
}

// The default version is read from the package manifest, so tests never hardcode it.
const BASE_VERSION = markdownSnippets.agentsVerification().version
const UPGRADED_VERSION = "99.0.0"

const VERIFICATION = "pjt:markdown:agents:verification"
const COMMITS = "pjt:markdown:agents:commits"
const NO_SHORTCUTS = "pjt:markdown:agents:no-destructive-shortcuts"
const LICENSE = "pjt:markdown:readme:license"

const upgradedVerification = () =>
  markdownSnippets.agentsVerification({
    version: UPGRADED_VERSION,
    content: "## Verification\n\nRun the full check, every time.\n",
  })

describe("blueprint-markdown lifecycle", () => {
  it("install → add → remodel → upgrade → inspect → remodel → hand-edit → swap → remove", async () => {
    await writeFile("AGENTS.md", AGENTS_SEED)
    await writeFile("README.md", README_SEED)

    // 1. Install: one snippet.
    await remodelTree([markdownSnippets.agentsVerification()])
    expect(unmanaged(await readFile("AGENTS.md"))).toBe(AGENTS_SEED)
    expect(region(await readFile("AGENTS.md"), VERIFICATION)).not.toBe("")
    expect(await readFile("README.md")).toBe(README_SEED)

    // 2. Add two snippets to the same file (plus a README one), remodel.
    let tree = [
      markdownSnippets.agentsVerification(),
      markdownSnippets.agentsCommits(),
      markdownSnippets.readmeLicense(),
    ]
    const added = await remodelTree(tree)
    expect([...added.written].toSorted()).toEqual(["AGENTS.md", "README.md"])
    const agents = await readFile("AGENTS.md")
    expect(region(agents, VERIFICATION)).not.toBe("")
    expect(region(agents, COMMITS)).not.toBe("")
    expect(unmanaged(agents)).toBe(AGENTS_SEED)
    expect(unmanaged(await readFile("README.md"))).toBe(README_SEED)
    expect(await lockEntry(VERIFICATION)).toMatchObject({ version: BASE_VERSION })
    expect(await lockEntry(COMMITS)).toMatchObject({ version: BASE_VERSION })

    // A human edits outside the regions: text after the regions, and a paragraph between them.
    const verificationBlock = region(agents, VERIFICATION)
    const humanAgents = `${agents.replace(verificationBlock, `${verificationBlock}\nBetween regions.\n\n`)}\nUser footer note.\n`
    await writeFile("AGENTS.md", humanAgents)
    const humanText = unmanaged(humanAgents)
    expect(humanText).toContain("Between regions.")
    expect(humanText).toContain("User footer note.")

    // 3. Remodel twice in a row with no changes: no writes, no byte changes.
    const snapshot = {
      agents: await readFile("AGENTS.md"),
      readme: await readFile("README.md"),
      lock: await readFile(".pjt.lock"),
    }
    expect(await remodelTree(tree)).toEqual({ written: [], removed: [] })
    expect(await remodelTree(tree)).toEqual({ written: [], removed: [] })
    expect(await readFile("AGENTS.md")).toBe(snapshot.agents)
    expect(await readFile("README.md")).toBe(snapshot.readme)
    expect(await readFile(".pjt.lock")).toBe(snapshot.lock)
    expect(await hasDrift(tree)).toBe(false)

    // 4. Package upgrade: inspect reports drift naming the file and the upgrade.
    tree = [
      upgradedVerification(),
      markdownSnippets.agentsCommits(),
      markdownSnippets.readmeLicense(),
    ]
    const drifted = await inspectTree(tree)
    expect(drifted.hasDrift).toBe(true)
    expect(drifted.upgrades).toEqual([
      { blueprintId: VERIFICATION, from: BASE_VERSION, to: UPGRADED_VERSION },
    ])
    expect(drifted.files.filter((f) => f.status !== "ok").map((f) => f.path)).toEqual(["AGENTS.md"])

    // 5. Remodel updates only the upgraded snippet's region; the lockfile records the version.
    const upgraded = await remodelTree(tree)
    expect(upgraded.written).toEqual(["AGENTS.md"])
    const afterUpgrade = await readFile("AGENTS.md")
    expect(afterUpgrade).toBe(
      snapshot.agents.replace(
        region(snapshot.agents, VERIFICATION),
        region(afterUpgrade, VERIFICATION),
      ),
    )
    expect(region(afterUpgrade, VERIFICATION)).toContain("Run the full check, every time.")
    expect(region(afterUpgrade, COMMITS)).toBe(region(snapshot.agents, COMMITS))
    expect(unmanaged(afterUpgrade)).toBe(humanText)
    expect(await readFile("README.md")).toBe(snapshot.readme)
    expect(await lockEntry(VERIFICATION)).toMatchObject({ version: UPGRADED_VERSION })
    expect(await lockEntry(COMMITS)).toMatchObject({ version: BASE_VERSION })
    expect(await hasDrift(tree)).toBe(false)

    // 6. Hand-edit inside a managed region: inspect names the file, remodel restores it.
    const clean = await readFile("AGENTS.md")
    await writeFile("AGENTS.md", clean.replace("Write conventional", "Write sloppy"))
    const edited = await readFile("AGENTS.md")
    expect(edited).not.toBe(clean)
    const editedReport = await inspectTree(tree)
    expect(editedReport.hasDrift).toBe(true)
    const agentsDiff = editedReport.files.find((f) => f.status !== "ok")
    expect(agentsDiff?.path).toBe("AGENTS.md")
    expect(agentsDiff?.summary).toContain(`region ${COMMITS} content drift`)
    expect(await written(tree)).toEqual(["AGENTS.md"])
    expect(await readFile("AGENTS.md")).toBe(clean)
    expect(await hasDrift(tree)).toBe(false)

    // 7. Swap a snippet for another: only the old region goes, the new one arrives.
    tree = [
      upgradedVerification(),
      markdownSnippets.agentsNoDestructiveShortcuts(),
      markdownSnippets.readmeLicense(),
    ]
    const swapped = await remodelTree(tree)
    expect(swapped.removed).toEqual(["AGENTS.md"])
    const afterSwap = await readFile("AGENTS.md")
    expect(region(afterSwap, COMMITS)).toBe("")
    expect(region(afterSwap, NO_SHORTCUTS)).not.toBe("")
    expect(region(afterSwap, VERIFICATION)).toBe(region(clean, VERIFICATION))
    expect(unmanaged(afterSwap)).toBe(humanText)
    expect(await lockEntry(COMMITS)).toBeUndefined()
    expect(await lockEntry(NO_SHORTCUTS)).toMatchObject({ version: BASE_VERSION })
    expect(await hasDrift(tree)).toBe(false)

    // 8. Remove a snippet: only its region is deleted.
    tree = [upgradedVerification(), markdownSnippets.agentsNoDestructiveShortcuts()]
    const removed = await remodelTree(tree)
    expect(removed.removed).toEqual(["README.md"])
    expect(await readFile("README.md")).toBe(README_SEED)
    expect(await readFile("AGENTS.md")).toBe(afterSwap)
    expect(await lockEntry(LICENSE)).toBeUndefined()
    expect(await hasDrift(tree)).toBe(false)
  })

  it("produces identical files and lockfile for the same inputs in two fresh projects", async () => {
    const other = await fs.mkdtemp(`${ROOT}-twin-`)
    try {
      const tree = [
        markdownSnippets.agentsVerification(),
        markdownSnippets.agentsCommits(),
        markdownSnippets.readmeLicense(),
      ]
      await Promise.all(
        [cwd, other].map((root) =>
          writeFile("AGENTS.md", AGENTS_SEED, root)
            .then(() => writeFile("README.md", README_SEED, root))
            .then(() => remodelTree(tree, root)),
        ),
      )
      const files = ["AGENTS.md", "README.md", ".pjt.lock"]
      const [mine, theirs] = await Promise.all(
        [cwd, other].map((root) => Promise.all(files.map((file) => readFile(file, root)))),
      )
      expect(theirs).toEqual(mine)
    } finally {
      await fs.rm(other, { recursive: true, force: true })
    }
  })

  it("creates the file when it is absent, and removing its only snippet leaves an empty file", async () => {
    const tree = [markdownSnippets.readmeLicense()]
    await remodelTree(tree)
    expect(await readFile("README.md")).toContain(`<!-- ${LICENSE} start -->`)

    // The remover deletes regions, never whole files — only `owned` files are deleted.
    const removed = await remodelTree([])
    expect(removed.removed).toEqual(["README.md"])
    expect(await exists("README.md")).toBe(true)
    expect(await readFile("README.md")).toBe("")
  })
})

describe("blueprint-markdown conflicts", () => {
  it("fails with pjt.plan.conflict-region when two blueprints claim the same owner id in one file", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        buildPlan({
          tree: [
            markdownSnippets.agentsVerification(),
            markdownSnippets.agentsVerification({ content: "## Verification\n\nDifferent.\n" }),
          ],
          projectRoot: cwd,
        }),
      ),
    )
    expect(error).toMatchObject({
      id: "pjt.plan.conflict-region",
      path: "AGENTS.md",
      ownerA: VERIFICATION,
      ownerB: VERIFICATION,
    })
  })

  it("leaves files and lockfile untouched when remodel hits a plan conflict", async () => {
    await writeFile("AGENTS.md", AGENTS_SEED)
    await expect(
      remodelTree([markdownSnippets.agentsVerification(), markdownSnippets.agentsVerification()]),
    ).rejects.toThrow()
    expect(await readFile("AGENTS.md")).toBe(AGENTS_SEED)
    expect(await exists(".pjt.lock")).toBe(false)
  })
})
