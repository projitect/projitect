import { createRequire } from "node:module"
import { Effect } from "effect"
import { pjt as pjtRaw, isEffectTree } from "@projitect/cli-internals"
import type { ProjitectFile, BlueprintTree } from "@projitect/cli-internals"
import { projitectBlueprint } from "./projitect-blueprint.js"

const require = createRequire(import.meta.url)
const pkg = require("../package.json") as {
  readonly version: string
  readonly peerDependencies: { readonly effect: string }
}

const our = projitectBlueprint({
  projitect: pkg.version,
  effect: pkg.peerDependencies.effect,
})

/**
 * Configure projitect from your `.pjt.ts`. Same shape as `pjt` from `@projitect/cli-internals`,
 * but auto-prepends the projitect blueprint so projitect itself stays in sync inside the host
 * project (package.json `pjt` script + `@projitect/cli`/`effect` devDeps + `.pjt.ts` import region).
 *
 * Users import this version, **not** the raw one. The prepended blueprint flows through the
 * standard planner / applier / lockfile pipeline like any other.
 */
export const pjt = (input: {
  readonly blueprints: ProjitectFile["blueprints"]
  readonly config?: Record<string, unknown>
}): ProjitectFile => {
  const prepended: ProjitectFile["blueprints"] = isEffectTree(input.blueprints)
    ? input.blueprints.pipe(Effect.map((array): BlueprintTree => [our, ...array]))
    : [our, ...input.blueprints]
  return pjtRaw({ ...input, blueprints: prepended })
}

export { directory } from "@projitect/blueprint"
