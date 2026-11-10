import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import type { Blueprint } from "@projitect/core"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { exec } from "../src/constructors.js"

/**
 * Unit tests for the `exec` helper: the Exec operation it plans, the exec permissions it
 * declares, and that a blueprint built with it is a plain `Blueprint`.
 */

const spec = { id: "my-org:format", version: "1.0.0", check: "pnpm lint", fix: "pnpm lint:fix" }

const planOps = (blueprint: Blueprint.Blueprint) =>
  Effect.runPromise(
    blueprint.plan.pipe(
      Effect.provide(makeInMemoryLayer({})),
      Effect.map((cs) => cs.operations),
    ),
  )

describe("exec", () => {
  it("plans one Exec op whose command is the fix and whose check is the check", async () => {
    const ops = await planOps(exec(spec))
    expect(ops).toEqual([
      { _tag: "Exec", ownerId: "my-org:format", command: "pnpm lint:fix", check: "pnpm lint" },
    ])
  })

  it("declares an exec permission for exactly the fix and check commands", () => {
    expect(exec(spec).permissions).toEqual([
      { kind: "exec", command: "pnpm lint:fix" },
      { kind: "exec", command: "pnpm lint" },
    ])
  })

  it("declares one permission when the check and fix are the same command", () => {
    expect(exec({ ...spec, check: "fmt", fix: "fmt" }).permissions).toEqual([
      { kind: "exec", command: "fmt" },
    ])
  })

  it("appends extra permissions and carries the description", () => {
    const blueprint = exec({
      ...spec,
      description: "Formats the project",
      extraPermissions: [{ kind: "read", glob: "package.json" }],
    })
    expect(blueprint.description).toBe("Formats the project")
    expect(blueprint.permissions.at(-1)).toEqual({ kind: "read", glob: "package.json" })
  })

  it("produces a Blueprint", () => {
    const blueprint: Blueprint.Blueprint = exec(spec)
    expect(blueprint.id).toBe("my-org:format")
    expect(blueprint.version).toBe("1.0.0")
  })
})
