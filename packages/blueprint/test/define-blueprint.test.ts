import { describe, expect, it } from "vitest"
import { Effect, Schema } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { defineBlueprint } from "../src/define-blueprint.js"
import { ownFile } from "../src/constructors.js"

/**
 * Unit tests for `defineBlueprint`. The contract under test: the returned definition is callable
 * with its declared arguments to produce a `Blueprint`, exposes `id` / `args` as plain readable
 * properties without calling it, and never runs the Schema against the arguments it receives.
 */

const ArgsSchema = Schema.Struct({
  content: Schema.optional(Schema.String),
})

const planOps = (blueprint: ReturnType<typeof ownFile>) =>
  Effect.runPromise(
    blueprint.plan.pipe(
      Effect.provide(makeInMemoryLayer({})),
      Effect.map((cs) => cs.operations),
    ),
  )

describe("defineBlueprint", () => {
  it("plans a ChangeSet that changes as the arguments change", async () => {
    const toyFile = defineBlueprint({
      id: "pjt:toy:file",
      args: ArgsSchema,
      build: (args) =>
        ownFile({
          id: "pjt:toy:file",
          version: "1.0.0",
          path: "toy.txt",
          content: args.content ?? "default content",
        }),
    })

    const defaultOps = await planOps(toyFile())
    expect(defaultOps).toHaveLength(1)
    expect(defaultOps[0]).toMatchObject({ _tag: "Owned", content: "default content" })

    const customOps = await planOps(toyFile({ content: "custom content" }))
    expect(customOps[0]).toMatchObject({ _tag: "Owned", content: "custom content" })
  })

  it("exposes id and args as readable properties without calling the definition", () => {
    const toyFile = defineBlueprint({
      id: "pjt:toy:file",
      args: ArgsSchema,
      build: (args) =>
        ownFile({
          id: "pjt:toy:file",
          version: "1.0.0",
          path: "toy.txt",
          content: args.content ?? "default content",
        }),
    })

    expect(toyFile.id).toBe("pjt:toy:file")
    expect(toyFile.args).toBe(ArgsSchema)
  })

  it("passes arguments through to build unchanged, without decoding them", () => {
    let received: unknown
    const echo = defineBlueprint({
      id: "pjt:toy:echo",
      args: Schema.Struct({ value: Schema.optional(Schema.Unknown) }),
      build: (args) => {
        received = args
        return ownFile({ id: "pjt:toy:echo", version: "1.0.0", path: "echo.txt", content: "" })
      },
    })

    const raw = { value: { nested: 1, extra: "not declared on the schema" } }
    echo(raw)

    expect(received).toBe(raw)
  })
})
