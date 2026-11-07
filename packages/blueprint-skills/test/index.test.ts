import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import type { Blueprint } from "@projitect/core"
import { buildPlan, diffLockfile, makeRealLayer } from "@projitect/cli-internals"
import { skills } from "../src/index.js"

/**
 * Unit tests for `@projitect/blueprint-skills`. Planning runs against the in-memory
 * `BlueprintFileSystem`; conflict, removal and sandbox cases go through `cli-internals`'
 * `buildPlan` / `diffLockfile`, which is the engine `build` / `remodel` / `inspect` use. Drift on
 * an owned file and on-disk removal are covered by `cli-internals`' differ / remover tests and the
 * end-to-end `scripts/smoke.sh`.
 */

const SKILL_MD = "# Skill\n"

type Overrides = Partial<Parameters<typeof skills>[0]>

const mk = (options: Overrides & Pick<Parameters<typeof skills>[0], "skills">) =>
  skills({ id: "pjt:test", version: "1.0.0", ...options })

const planOps = (blueprint: ReturnType<typeof skills>) =>
  Effect.runPromise(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({})))).then(
    // Skills only plan file operations; narrowing out `Exec` gives every op a `path`.
    (changeSet) => changeSet.operations.filter((op) => op._tag !== "Exec"),
  )

const planError = (blueprint: ReturnType<typeof skills>) =>
  Effect.runPromise(Effect.flip(blueprint.plan.pipe(Effect.provide(makeInMemoryLayer({})))))

const one = (name: string, files?: Record<string, string>) => ({
  name,
  files: files ?? { "SKILL.md": SKILL_MD },
})

// What the confined worker does: run each blueprint's plan behind the permission gate, hand the
// results to `buildPlan`. Run in-process here so the tests need no child.
const buildAll = (tree: readonly Blueprint.Blueprint[]) =>
  Effect.forEach(tree, (blueprint) =>
    blueprint.plan.pipe(
      Effect.provide(
        makeRealLayer({
          blueprintId: blueprint.id,
          permissions: blueprint.permissions,
          projectRoot: process.cwd(),
        }),
      ),
      Effect.map((changeSet) => ({
        id: blueprint.id,
        version: blueprint.version,
        permissions: blueprint.permissions,
        directoryPrefix: "",
        changeSet,
      })),
    ),
  ).pipe(Effect.flatMap((planned) => buildPlan({ planned })))

describe("skills() — layout", () => {
  it("writes every file under .claude/skills/<name>/, including nested assets", async () => {
    const ops = await planOps(
      mk({
        skills: [
          one("review", {
            "SKILL.md": SKILL_MD,
            "scripts/run.sh": "echo hi\n",
            "assets/img/logo.txt": "logo",
          }),
        ],
      }),
    )
    expect(ops.map((o) => o._tag)).toEqual(["Owned", "Owned", "Owned"])
    expect(ops.map((o) => o.path).toSorted()).toEqual([
      ".claude/skills/review/SKILL.md",
      ".claude/skills/review/assets/img/logo.txt",
      ".claude/skills/review/scripts/run.sh",
    ])
  })

  it("installs the same layout under a custom target", async () => {
    const ops = await planOps(
      mk({
        target: ".agents/skills",
        skills: [one("review", { "SKILL.md": SKILL_MD, "a/b.txt": "b" })],
      }),
    )
    expect(ops.map((o) => o.path).toSorted()).toEqual([
      ".agents/skills/review/SKILL.md",
      ".agents/skills/review/a/b.txt",
    ])
  })

  it("installs two skills in one package side by side", async () => {
    const ops = await planOps(mk({ skills: [one("a"), one("b")] }))
    expect(ops.map((o) => o.path).toSorted()).toEqual([
      ".claude/skills/a/SKILL.md",
      ".claude/skills/b/SKILL.md",
    ])
  })

  it("scopes write permission to the target root", () => {
    expect(mk({ skills: [one("a")] }).permissions).toEqual([
      { kind: "write", glob: ".claude/skills/**" },
    ])
    expect(mk({ target: ".agents/skills", skills: [one("a")] }).permissions).toEqual([
      { kind: "write", glob: ".agents/skills/**" },
    ])
  })
})

describe("skills() — validation", () => {
  const withFiles = (files: Record<string, string>) =>
    mk({ skills: [one("a", { "SKILL.md": "x", ...files })] })

  it.each([
    { label: "an empty skill name", blueprint: mk({ skills: [one("")] }), field: "name" },
    {
      label: "a name containing a separator",
      blueprint: mk({ skills: [one("a/b")] }),
      field: "name",
    },
    {
      label: "a name containing a backslash",
      blueprint: mk({ skills: [one(String.raw`a\b`)] }),
      field: "name",
    },
    { label: "a `..` name", blueprint: mk({ skills: [one("..")] }), field: "name" },
    { label: "an absolute file path", blueprint: withFiles({ "/etc/passwd": "x" }), field: "path" },
    {
      label: "a `..` segment in a file path",
      blueprint: withFiles({ "../evil": "x" }),
      field: "path",
    },
    {
      label: "backslash traversal in a file path",
      blueprint: withFiles({ "..\\evil": "x" }),
      field: "path",
    },
    { label: "a drive-letter path", blueprint: withFiles({ "C:/evil": "x" }), field: "path" },
    { label: "an empty path segment", blueprint: withFiles({ "a//b": "x" }), field: "path" },
    {
      label: "a traversing target",
      blueprint: mk({ target: "../out", skills: [one("a")] }),
      field: "target",
    },
    {
      label: "an absolute target",
      blueprint: mk({ target: "/tmp/skills", skills: [one("a")] }),
      field: "target",
    },
    {
      label: "a skill without SKILL.md",
      blueprint: mk({ skills: [one("a", { "run.sh": "x" })] }),
      field: "skill",
    },
    {
      label: "duplicate skill names",
      blueprint: mk({ skills: [one("a"), one("a")] }),
      field: "skill",
    },
  ])("rejects $label", async ({ blueprint, field }) => {
    const error = await planError(blueprint)
    expect(error).toMatchObject({ _tag: "SkillInvalid", id: "pjt.skills.invalid-path", field })
  })
})

describe("skills() — engine integration", () => {
  it("lets skills from two packages install side by side", async () => {
    const { plan } = await Effect.runPromise(
      buildAll([
        mk({ id: "pkg:one", skills: [one("a")] }),
        mk({ id: "pkg:two", skills: [one("b")] }),
      ]),
    )
    expect(plan.files.map((f) => f.path).toSorted()).toEqual([
      ".claude/skills/a/SKILL.md",
      ".claude/skills/b/SKILL.md",
    ])
  })

  it("fails with pjt.plan.conflict-owned when two blueprints claim one path", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        buildAll([
          mk({ id: "pkg:one", skills: [one("a")] }),
          mk({ id: "pkg:two", skills: [one("a")] }),
        ]),
      ),
    )
    expect(error).toMatchObject({
      id: "pjt.plan.conflict-owned",
      path: ".claude/skills/a/SKILL.md",
    })
  })

  it("refuses a write outside the target root with FsPermissionDenied", async () => {
    const sandboxed = mk({ skills: [one("a")] })
    const escaping = {
      ...sandboxed,
      plan: Effect.gen(function* () {
        const { BlueprintFileSystem } = yield* Effect.promise(() => import("@projitect/core"))
        const fs = yield* BlueprintFileSystem
        yield* fs.writeFile("README.md", "nope")
        return { operations: [] }
      }),
    }
    const error = await Effect.runPromise(Effect.flip(buildAll([escaping])))
    expect(error).toMatchObject({ _tag: "FsPermissionDenied" })
  })

  it("a version bump lists files the new version dropped as removals", async () => {
    const v1 = await Effect.runPromise(
      buildAll([
        mk({
          version: "1.0.0",
          skills: [one("a", { "SKILL.md": "1", "old.txt": "o", "keep.txt": "k" })],
        }),
      ]),
    )
    const v2 = await Effect.runPromise(
      buildAll([
        mk({
          version: "1.1.0",
          skills: [one("a", { "SKILL.md": "2", "keep.txt": "k", "new.txt": "n" })],
        }),
      ]),
    )
    const previous = { version: 1 as const, blueprints: v1.byBlueprint }
    const diff = diffLockfile({ previous, current: v2.byBlueprint })
    expect(diff.removals.map((r) => r.path)).toEqual([".claude/skills/a/old.txt"])
    expect(v2.plan.files.map((f) => f.path)).toContain(".claude/skills/a/new.txt")
  })

  it("records each skill's directory as the owned dir for pruning", async () => {
    const { byBlueprint } = await Effect.runPromise(buildAll([mk({ skills: [one("a")] })]))
    expect(byBlueprint["pjt:test"]?.operations).toEqual([
      {
        _tag: "Owned",
        path: ".claude/skills/a/SKILL.md",
        ownerId: "pjt:test",
        ownedDir: ".claude/skills/a",
      },
    ])
  })

  it("does not remove a path another blueprint now owns", async () => {
    const before = await Effect.runPromise(buildAll([mk({ id: "pkg:one", skills: [one("a")] })]))
    const after = await Effect.runPromise(buildAll([mk({ id: "pkg:two", skills: [one("a")] })]))
    const previous = { version: 1 as const, blueprints: before.byBlueprint }
    const diff = diffLockfile({ previous, current: after.byBlueprint })
    expect(diff.removals).toEqual([])
  })

  it("removing one skill lists only that skill's files as removals", async () => {
    const both = await Effect.runPromise(buildAll([mk({ skills: [one("a"), one("b")] })]))
    const onlyA = await Effect.runPromise(buildAll([mk({ skills: [one("a")] })]))
    const previous = { version: 1 as const, blueprints: both.byBlueprint }
    const diff = diffLockfile({ previous, current: onlyA.byBlueprint })
    expect(diff.removals.map((r) => r.path)).toEqual([".claude/skills/b/SKILL.md"])
  })
})
