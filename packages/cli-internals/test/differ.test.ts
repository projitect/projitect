import { Effect } from "effect"
import type { Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { BlueprintFileSystem } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { diffPlan, renderInspectReport, renderPlanDiff } from "../src/differ.js"
import type { ProjectPlan } from "../src/plan.js"

/**
 * `differ.ts` is what makes `pjt inspect` actually useful. The reducer can produce a perfect plan
 * but if the differ misreports drift (false-positive or false-negative), the CI signal becomes
 * untrustworthy and the "in spec / out of spec" promise breaks.
 *
 * Tests cover the four file kinds + the report-rendering glue:
 *  - region: create (file absent), ok (region matches), modify (content drift), modify (region absent)
 *  - merge: create, ok (canonical equality), modify (drift), modify (unparseable existing JSON)
 *  - owned: create, ok, modify
 *  - seed: create, ok (never marked drift even if content differs)
 *  - mergeIntoExisting: deep merge, last-write-wins on conflict, array replacement (not concat)
 *  - renderInspectReport: combines upgrades + removals + per-file lines in the right order
 *  - renderPlanDiff: short-circuits to "in sync" when nothing drifted
 */

let layer: Layer.Layer<BlueprintFileSystem>

beforeEach(() => {
  layer = makeInMemoryLayer()
})

const run = <A, E>(effect: Effect.Effect<A, E, BlueprintFileSystem>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, layer))

const writeFile = (relative: string, content: string): Promise<void> =>
  run(Effect.flatMap(BlueprintFileSystem, (fs) => fs.writeFile(relative, content)))

const runPlan = (plan: ProjectPlan) => run(diffPlan({ plan }))

describe("diffPlan — region kind", () => {
  it("reports create when the file is absent", async () => {
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Region",
          path: ".gitignore",
          commentPrefix: "#",
          regions: [{ ownerId: "pjt:a", content: ".DS_Store\n" }],
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.hasDrift).toBe(true)
    expect(out.files[0]?.status).toBe("create")
    expect(out.files[0]?.summary).toBe("+ create .gitignore (1 region)")
  })

  it("reports ok when the existing region matches the planned content", async () => {
    await writeFile(".gitignore", ["# pjt:a start", ".DS_Store", "# pjt:a end", ""].join("\n"))
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Region",
          path: ".gitignore",
          commentPrefix: "#",
          regions: [{ ownerId: "pjt:a", content: ".DS_Store" }],
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.hasDrift).toBe(false)
    expect(out.files[0]?.status).toBe("ok")
  })

  it("reports modify when the region content differs from the plan", async () => {
    await writeFile(".gitignore", ["# pjt:a start", "HAND_EDITED", "# pjt:a end", ""].join("\n"))
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Region",
          path: ".gitignore",
          commentPrefix: "#",
          regions: [{ ownerId: "pjt:a", content: ".DS_Store" }],
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.hasDrift).toBe(true)
    expect(out.files[0]?.summary).toContain("content drift")
  })

  it("reports modify when the file exists but the region is missing entirely", async () => {
    await writeFile(".gitignore", "unrelated user content\n")
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Region",
          path: ".gitignore",
          commentPrefix: "#",
          regions: [{ ownerId: "pjt:a", content: ".DS_Store" }],
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.hasDrift).toBe(true)
    expect(out.files[0]?.summary).toContain("missing region pjt:a")
  })
})

describe("diffPlan — merge kind", () => {
  it("reports create when the JSON file is absent", async () => {
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Merge",
          path: "package.json",
          value: { scripts: { pjt: "pjt" } },
          ownership: new Map([["scripts.pjt", "pjt:projitect"]]),
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.files[0]?.status).toBe("create")
  })

  it("reports ok when the merged result already matches disk", async () => {
    await writeFile(
      "package.json",
      `${JSON.stringify({ name: "x", scripts: { pjt: "pjt" } }, null, 2)}\n`,
    )
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Merge",
          path: "package.json",
          value: { scripts: { pjt: "pjt" } },
          ownership: new Map([["scripts.pjt", "pjt:projitect"]]),
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.hasDrift).toBe(false)
  })

  it("reports modify when an owned key drifts on disk", async () => {
    await writeFile(
      "package.json",
      `${JSON.stringify({ scripts: { pjt: "wrong-value" } }, null, 2)}\n`,
    )
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Merge",
          path: "package.json",
          value: { scripts: { pjt: "pjt" } },
          ownership: new Map([["scripts.pjt", "pjt:projitect"]]),
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.hasDrift).toBe(true)
    expect(out.files[0]?.summary).toContain("JSON merge")
  })

  it("reports modify when existing file is not valid JSON", async () => {
    await writeFile("package.json", "{not json")
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Merge",
          path: "package.json",
          value: {},
          ownership: new Map(),
        },
      ],
    }
    const out = await runPlan(plan)
    expect(out.files[0]?.summary).toContain("unparseable JSON")
  })
})

describe("diffPlan — owned kind", () => {
  it("reports create / ok / modify based on byte-for-byte content match", async () => {
    const plan: ProjectPlan = {
      files: [
        {
          _tag: "Owned",
          path: "generated.ts",
          ownerId: "pjt:gen",
          content: "// generated\n",
        },
      ],
    }

    // 1. absent → create
    let out = await runPlan(plan)
    expect(out.files[0]?.status).toBe("create")

    // 2. matching content → ok
    await writeFile("generated.ts", "// generated\n")
    out = await runPlan(plan)
    expect(out.files[0]?.status).toBe("ok")

    // 3. drift → modify
    await writeFile("generated.ts", "// hand-edited\n")
    out = await runPlan(plan)
    expect(out.files[0]?.status).toBe("modify")
  })
})

describe("diffPlan — seed kind", () => {
  it("reports create when absent; ok even when content differs (write-once contract)", async () => {
    const plan: ProjectPlan = {
      files: [{ _tag: "Seed", path: ".pjt.ts", ownerId: "pjt:seed", content: "original" }],
    }
    let out = await runPlan(plan)
    expect(out.files[0]?.status).toBe("create")

    await writeFile(".pjt.ts", "user has heavily edited this")
    out = await runPlan(plan)
    expect(out.files[0]?.status).toBe("ok")
    expect(out.files[0]?.summary).toContain("seed, never enforced")
  })
})

// Deep-merge behavior is covered by @nunofyobiz/effect-extras' RecordX.deepMerge tests.

describe("renderPlanDiff", () => {
  it("short-circuits to a single 'in sync' line when nothing drifts", () => {
    const out = renderPlanDiff({ files: [], hasDrift: false })
    expect(out).toBe("Project is in sync with blueprints. No changes needed.")
  })

  it("renders one summary line per file when there is drift", () => {
    const out = renderPlanDiff({
      files: [
        { path: "a", status: "create", summary: "+ create a" },
        { path: "b", status: "modify", summary: "~ modify b" },
      ],
      hasDrift: true,
    })
    expect(out).toBe("+ create a\n~ modify b")
  })
})

describe("renderInspectReport", () => {
  it("orders upgrades first, then removals, then per-file diff lines", () => {
    const out = renderInspectReport({
      diff: {
        files: [{ path: "a", status: "modify", summary: "~ modify a" }],
        hasDrift: true,
      },
      removals: [{ _tag: "Region", path: ".gitignore", ownerId: "pjt:left", commentPrefix: "#" }],
      upgrades: [{ blueprintId: "pjt:stay", from: "0.1.0", to: "0.2.0" }],
    })
    const lines = out.split("\n")
    expect(lines[0]).toBe("↑ upgrade pjt:stay 0.1.0 → 0.2.0")
    expect(lines[1]).toContain("- remove pjt:left region from .gitignore")
    expect(lines[2]).toBe("~ modify a")
  })

  it("renders 'in sync' when there's nothing to report", () => {
    const out = renderInspectReport({
      diff: { files: [], hasDrift: false },
      removals: [],
      upgrades: [],
    })
    expect(out).toBe("Project is in sync with blueprints. No changes needed.")
  })

  it("renders each removal mode with its own marker line", () => {
    const out = renderInspectReport({
      diff: { files: [], hasDrift: false },
      removals: [
        { _tag: "Region", path: ".gitignore", ownerId: "pjt:r", commentPrefix: "#" },
        { _tag: "Merge", path: "package.json", ownedKeys: ["scripts.x", "scripts.y"] },
        { _tag: "Owned", path: "gen.ts", ownerId: "pjt:o" },
        { _tag: "Seed", path: ".pjt.ts", ownerId: "pjt:s" },
      ],
      upgrades: [],
    })
    expect(out).toContain("- remove pjt:r region from .gitignore")
    expect(out).toContain("- remove merge keys scripts.x, scripts.y from package.json")
    expect(out).toContain("- delete gen.ts")
    expect(out).toContain("(seed pjt:s for .pjt.ts retained")
  })
})
