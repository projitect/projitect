import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { Effect, Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { next } from "@projitect/blueprint-next"
import type { Blueprint } from "@projitect/core"
import { diffPlan } from "../src/differ.js"
import { applyPlan } from "../src/applier.js"
import { readLockfile, writeLockfile } from "../src/lockfile.js"
import { buildPlan, diffLockfile } from "../src/plan.js"
import { applyRemovals } from "../src/remover.js"

/**
 * End-to-end lifecycle for `@projitect/blueprint-next` in a clean temporary project:
 * build → hand-edit the starter source → inspect → drift a managed value → remodel → remove.
 *
 * `remodelTree` / `inspectTree` run the same pipeline as the `remodel` / `inspect` commands
 * (build the plan, diff the lockfile, apply, remove, write the lockfile) minus the `.pjt.ts`
 * import. `hasDrift` is exactly what the `pjt inspect` binary turns into exit code 1.
 */

const ROOT = path.join(os.tmpdir(), "projitect-test-next-lifecycle")

const STARTER = [
  "eslint.config.mjs",
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/app/page.test.tsx",
  "src/app/page.tsx",
] as const

const MANAGED = ["next.config.ts", "tsconfig.json", "vitest.config.ts"] as const

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(`${ROOT}-`)
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

const readFile = (relative: string) => fs.readFile(path.join(cwd, relative), "utf8")
const writeFile = (relative: string, content: string) =>
  fs
    .mkdir(path.dirname(path.join(cwd, relative)), { recursive: true })
    .then(() => fs.writeFile(path.join(cwd, relative), content, "utf8"))
const exists = (relative: string) =>
  fs.access(path.join(cwd, relative)).then(
    () => true,
    () => false,
  )
/** The given files that exist, in the given order. */
const existing = (files: readonly string[]) =>
  Promise.all(files.map(async (file) => ((await exists(file)) ? [file] : []))).then((found) =>
    found.flat(),
  )
const PackageJson = Schema.Record(Schema.String, Schema.Unknown)
const readPackageJson = async () =>
  Schema.decodeUnknownSync(PackageJson)(JSON.parse(await readFile("package.json")))

const remodelTree = (tree: readonly Blueprint.Blueprint[]) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { plan, byBlueprint } = yield* buildPlan({ tree, projectRoot: cwd })
      const previous = yield* readLockfile({ projectRoot: cwd })
      const { removals } = diffLockfile({ previous, current: byBlueprint })
      const written = yield* applyPlan({ plan, projectRoot: cwd })
      const removed = yield* applyRemovals({ removals, projectRoot: cwd })
      yield* writeLockfile({ projectRoot: cwd, lock: { version: 1, blueprints: byBlueprint } })
      return { written, removed }
    }),
  )

const inspectTree = (tree: readonly Blueprint.Blueprint[]) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { plan, byBlueprint } = yield* buildPlan({ tree, projectRoot: cwd })
      const previous = yield* readLockfile({ projectRoot: cwd })
      const { removals } = diffLockfile({ previous, current: byBlueprint })
      const diff = yield* diffPlan({ plan, projectRoot: cwd })
      return { hasDrift: diff.hasDrift || removals.length > 0, files: diff.files }
    }),
  )

const hasDrift = (tree: readonly Blueprint.Blueprint[]) =>
  inspectTree(tree).then((report) => report.hasDrift)

/** Overwrite an owned file, then check inspect flags it and remodel restores it byte for byte. */
const restoredAfterDrift = async (file: string, tree: readonly Blueprint.Blueprint[]) => {
  const original = await readFile(file)
  await writeFile(file, "{}\n")
  expect(await hasDrift(tree)).toBe(true)
  await remodelTree(tree)
  expect(await readFile(file)).toBe(original)
  expect(await hasDrift(tree)).toBe(false)
}

const USER_PACKAGE_JSON = {
  name: "my-app",
  version: "1.2.3",
  private: true,
  type: "module",
  scripts: { release: "changeset publish" },
  dependencies: { "left-pad": "^1.3.0" },
}

describe("blueprint-next lifecycle", () => {
  it("build → edit starter → inspect → drift → remodel → remove", async () => {
    await writeFile("package.json", `${JSON.stringify(USER_PACKAGE_JSON, null, 2)}\n`)
    await writeFile(".gitignore", "# mine\n.env\n")
    const tree = [next()]

    // 1. Build: every file appears, user keys and the user's .gitignore text survive.
    await remodelTree(tree)
    expect(await existing([...STARTER, ...MANAGED])).toEqual([...STARTER, ...MANAGED])
    const built = await readPackageJson()
    expect(built["scripts"]).toMatchObject({
      release: "changeset publish",
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint .",
      test: "vitest run",
    })
    expect(built["dependencies"]).toMatchObject({ "left-pad": "^1.3.0" })
    for (const dependency of ["next", "react", "react-dom"]) {
      expect(built["dependencies"]).toHaveProperty([dependency])
    }
    for (const dependency of ["eslint-config-next", "typescript", "vitest", "jsdom"]) {
      expect(built["devDependencies"]).toHaveProperty([dependency])
    }
    const gitignore = await readFile(".gitignore")
    expect(gitignore).toContain("# mine\n.env\n")
    expect(gitignore).toContain(".next/")
    expect(gitignore).toContain("next-env.d.ts")
    expect(gitignore).toContain("node_modules/")
    expect(await hasDrift(tree)).toBe(false)

    // 2. The starter source is the user's: edit it, and neither inspect nor remodel touches it.
    await writeFile(
      "src/app/page.tsx",
      "export default function Page() {\n  return <p>Mine</p>\n}\n",
    )
    await writeFile("eslint.config.mjs", "export default []\n")
    expect(await hasDrift(tree)).toBe(false)
    const result = await remodelTree(tree)
    expect(result).toEqual({ written: [], removed: [] })
    expect(await readFile("src/app/page.tsx")).toContain("<p>Mine</p>")
    expect(await readFile("eslint.config.mjs")).toBe("export default []\n")

    // A seeded file the user deleted is written again — seed mode only means "never overwritten".
    await fs.rm(path.join(cwd, "src/app/globals.css"))
    const recreated = await remodelTree(tree)
    expect(recreated.written).toEqual(["src/app/globals.css"])
    expect(await exists("src/app/globals.css")).toBe(true)

    // 3. A managed package.json value drifts: inspect names the file, remodel restores it and
    //    leaves user keys alone.
    const manifest = await readFile("package.json")
    await writeFile(
      "package.json",
      manifest
        .replace('"build": "next build"', '"build": "next build --debug"')
        .replace('"next": "^16', '"next": "^15'),
    )
    const drifted = await inspectTree(tree)
    expect(drifted.hasDrift).toBe(true)
    expect(drifted.files.filter((f) => f.status !== "ok").map((f) => f.path)).toEqual([
      "package.json",
    ])
    await remodelTree(tree)
    const restored = await readPackageJson()
    expect(restored["scripts"]).toMatchObject({
      build: "next build",
      release: "changeset publish",
    })
    expect(restored["dependencies"]).toEqual(built["dependencies"])
    expect(await hasDrift(tree)).toBe(false)

    // 4. Owned files drift: restored in full.
    await restoredAfterDrift("next.config.ts", tree)
    await restoredAfterDrift("tsconfig.json", tree)

    // 5. Remove the blueprint: managed files and keys go, seeded source and user keys stay.
    await remodelTree([])
    expect(await existing(MANAGED)).toEqual([])
    expect(await readFile("src/app/page.tsx")).toContain("<p>Mine</p>")
    expect(await exists("src/app/layout.tsx")).toBe(true)
    expect(await exists("src/app/page.test.tsx")).toBe(true)
    expect(await readPackageJson()).toEqual(USER_PACKAGE_JSON)
    expect(await readFile(".gitignore")).toContain("# mine\n.env\n")
    expect(await readFile(".gitignore")).not.toContain(".next/")
    expect(await hasDrift([])).toBe(false)
  })
})
