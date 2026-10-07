import { Schema } from "effect"
import { defineBlueprint } from "../src/define-blueprint.js"
import { ownFile } from "../src/constructors.js"

/**
 * Type-only pins for `defineBlueprint`'s compile-time behaviour. No runtime assertions — this
 * file exists purely for `tsc --build` to walk (see `packages/blueprint/test/tsconfig.json` and
 * its reference from the root `tsconfig.json`). If any `@ts-expect-error` below stops being an
 * error, `pnpm tc` fails on the now-unused directive.
 */

const AllOptionalArgs = Schema.Struct({
  coverage: Schema.optional(Schema.String),
})

const RequiredArgs = Schema.Struct({
  name: Schema.String,
  flag: Schema.optional(Schema.Boolean),
})

const build = (): ReturnType<typeof ownFile> =>
  ownFile({ id: "pjt:toy:pin", version: "1.0.0", path: "pin.txt", content: "" })

const optionalDef = defineBlueprint({
  id: "pjt:toy:optional",
  args: AllOptionalArgs,
  build,
})

const requiredDef = defineBlueprint({
  id: "pjt:toy:required",
  args: RequiredArgs,
  build,
})

// Every field optional -> callable with no argument, and with the right shape.
optionalDef()
optionalDef({ coverage: "lcov" })

// @ts-expect-error -- optional field has the wrong type
optionalDef({ coverage: 123 })

// @ts-expect-error -- unknown extra field in an object literal
optionalDef({ coverage: "lcov", bogus: true })

// A required field present -> the argument itself becomes required.
requiredDef({ name: "x" })
requiredDef({ name: "x", flag: true })

// @ts-expect-error -- missing the argument entirely when a field is required
requiredDef()

// @ts-expect-error -- missing the required field
requiredDef({ flag: true })

// @ts-expect-error -- required field has the wrong type
requiredDef({ name: 123 })

// @ts-expect-error -- unknown extra field in an object literal
requiredDef({ name: "x", extra: "nope" })
