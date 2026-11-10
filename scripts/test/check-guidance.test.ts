import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const script = path.join(import.meta.dirname, "..", "check-guidance.mjs")
const roots: string[] = []

const run = (root: string): { readonly status: number; readonly output: string } => {
  try {
    return {
      status: 0,
      output: execFileSync("node", [script, root], { encoding: "utf8", stdio: "pipe" }),
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return { status: error.status, output: error.stderr }
    }
    throw error
  }
}

const makeRepo = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(path.join(tmpdir(), "guidance-"))
  roots.push(root)
  const all = {
    "AGENTS.md": "# Guide\n\n[index](docs/README.md)\n",
    "docs/README.md": "# Docs\n",
    ...files,
  }
  for (const [file, body] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), body)
  }
  symlinkSync("AGENTS.md", path.join(root, "CLAUDE.md"))
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("check-guidance", () => {
  it("passes a consistent repo", () => {
    expect(run(makeRepo({})).status).toBe(0)
  })

  it("rejects a broken relative link", () => {
    const result = run(makeRepo({ "AGENTS.md": "[gone](docs/missing.md)\n" }))
    expect(result.status).toBe(1)
    expect(result.output).toContain("broken link: docs/missing.md")
  })

  it("rejects a missing heading anchor", () => {
    const result = run(makeRepo({ "AGENTS.md": "[x](docs/README.md#nope)\n" }))
    expect(result.output).toContain("missing anchor")
  })

  it("rejects a same-file anchor to a missing heading", () => {
    const result = run(makeRepo({ "AGENTS.md": "# Guide\n\n[x](#missing-heading)\n" }))
    expect(result.status).toBe(1)
    expect(result.output).toContain("missing anchor: #missing-heading")
  })

  it("accepts a same-file anchor to an existing heading", () => {
    expect(run(makeRepo({ "AGENTS.md": "# Guide\n\n[x](#guide)\n" })).status).toBe(0)
  })

  it("rejects a docs page the index does not link", () => {
    const result = run(makeRepo({ "docs/orphan.md": "# Orphan\n" }))
    expect(result.output).toContain("docs/orphan.md is not linked from docs/README.md")
  })

  it("rejects a skill whose name differs from its directory", () => {
    const result = run(
      makeRepo({ ".claude/skills/demo/SKILL.md": "---\nname: other\ndescription: d\n---\n" }),
    )
    expect(result.output).toContain('frontmatter name must be "demo"')
  })

  it("rejects a CLAUDE.md that is not a symlink", () => {
    const root = makeRepo({})
    rmSync(path.join(root, "CLAUDE.md"))
    writeFileSync(path.join(root, "CLAUDE.md"), "copy")
    expect(run(root).output).toContain("CLAUDE.md must be a symlink")
  })
})
