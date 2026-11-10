import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { Schema } from "effect"

const CiEvidence = Schema.Struct({
  checks: Schema.Array(Schema.Struct({ name: Schema.String, app: Schema.String })),
})

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")

const configured = (): string[] =>
  Schema.decodeUnknownSync(CiEvidence)(JSON.parse(read(".ampm/ci-evidence.json")))
    .checks.map((check) => check.name)
    .toSorted()

const MATRIX_NODE = String.raw`${"$"}{{ matrix.node }}`

/** Expands each job's `name:` template over its `matrix.node` values, as GitHub reports them. */
const fromWorkflow = (): string[] => {
  const jobs = read(".github/workflows/ci.yml").split(/^jobs:\n/mu)[1] ?? ""
  return jobs
    .split(/^ {2}(?=[\w-]+:\n)/mu)
    .flatMap((block) => {
      const template = /^ {4}name: (?<value>.+)$/mu.exec(block)?.groups?.["value"]
      const nodes = /^ {8}node: \[(?<value>[^\]]+)\]$/mu.exec(block)?.groups?.["value"]
      if (template === undefined) {
        return []
      }
      if (nodes === undefined) {
        return [template]
      }
      return nodes
        .split(",")
        .map((node) => template.replace(MATRIX_NODE, node.trim().replaceAll('"', "")))
    })
    .toSorted()
}

describe(".ampm/ci-evidence.json", () => {
  it("names exactly the check runs ci.yml produces", () => {
    expect(fromWorkflow()).toHaveLength(14)
    expect(configured()).toEqual(fromWorkflow())
  })
})

describe(".ampm sandbox image", () => {
  const pnpm =
    /^pnpm@(?<version>.+)$/u.exec(
      Schema.decodeUnknownSync(Schema.Struct({ packageManager: Schema.String }))(
        JSON.parse(read("package.json")),
      ).packageManager,
    )?.groups?.["version"] ?? ""
  const node = read(".nvmrc").trim()

  it("pins the pnpm and node versions the repo declares", () => {
    expect(pnpm).not.toBe("")
    const dockerfile = read(".ampm/Dockerfile")
    expect(dockerfile).toContain(`pnpm@${pnpm}`)
    expect(dockerfile).toContain(`node:${node}-`)
    expect(read(".ampm/environment.json")).toContain(`\\"${pnpm}\\"`)
  })
})
