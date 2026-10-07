import { Effect, Schema } from "effect"
import type { Errors, PjtLock, ProjitectConfig } from "@projitect/core"
import { loadBlueprintFile, isEffectTree } from "../loader.js"
import type { BlueprintTree } from "../loader.js"
import { buildPlan, diffLockfile } from "../plan.js"
import type { UpgradeRecord } from "../plan.js"
import { diffPlan, renderInspectReport } from "../differ.js"
import type { FileDiff } from "../differ.js"
import { makeRealLayer } from "../filesystem-impl.js"
import { readLockfile } from "../lockfile.js"
import { InspectJson, InspectJsonSchemaUrl } from "./inspect-json.js"

/**
 * Result of `pjt inspect`. `output` is the human-readable rendering; the structured fields
 * (`files`, `removals`, `upgrades`) are what `--json` mode emits. Both representations are
 * always computed — switching modes is just a renderer choice.
 */
export interface InspectResult {
  readonly hasDrift: boolean
  readonly output: string
  readonly files: readonly FileDiff[]
  readonly removals: readonly PjtLock.LockOperation[]
  readonly upgrades: readonly UpgradeRecord[]
}

/**
 * `pjt inspect` — load the blueprint file, build the plan, diff against disk + lockfile, and
 * return both a human-readable summary and the structured pieces a `--json` consumer needs.
 *
 * The dispatcher decides which representation to print; the command keeps the `hasDrift`
 * boolean separate so the bin shim can set exit code 1 regardless of output mode (`pjt inspect
 * --json` still exits nonzero on drift, which CI relies on for the "in spec / out of spec"
 * promise).
 */
export const inspect = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
}): Effect.Effect<InspectResult, Errors.ProjitectError> =>
  Effect.gen(function* () {
    const file = yield* loadBlueprintFile({
      blueprintFile: params.config.blueprintFile,
      projectRoot: params.config.projectRoot,
    })
    const tree: BlueprintTree = isEffectTree(file.blueprints)
      ? yield* file.blueprints.pipe(
          Effect.provide(
            makeRealLayer({
              blueprintId: "pjt:config-loader",
              permissions: [{ kind: "read", glob: "**" }],
              projectRoot: params.config.projectRoot,
            }),
          ),
        )
      : file.blueprints
    const { plan, byBlueprint } = yield* buildPlan({
      tree,
      projectRoot: params.config.projectRoot,
    })
    const previous = yield* readLockfile({ projectRoot: params.config.projectRoot })
    const { removals, upgrades } = diffLockfile({ previous, current: byBlueprint })
    const diff = yield* diffPlan({ plan, projectRoot: params.config.projectRoot })
    const hasDrift = diff.hasDrift || removals.length > 0
    return {
      hasDrift,
      output: renderInspectReport({ diff, removals, upgrades }),
      files: diff.files,
      removals,
      upgrades,
    }
  })

/**
 * Render the inspect result as a stable JSON object for CI / scripting, conforming to the
 * published JSON Schema at {@link InspectJsonSchemaUrl} (also published at
 * `apps/website/public/schemas/inspect.v1.json`). The `$schema` key names that contract.
 *
 * Stable means: keys won't be renamed or removed without a major bump (and a new schema
 * version). New keys may be added at either level within a version; consumers should ignore
 * unknown keys. Encoding through {@link InspectJson} ties this output to the same definition the
 * schema is generated from, so the two can't drift apart.
 */
export const renderInspectJson = (result: InspectResult): string =>
  `${JSON.stringify(
    Schema.encodeSync(InspectJson)({
      $schema: InspectJsonSchemaUrl,
      hasDrift: result.hasDrift,
      files: result.files,
      removals: result.removals,
      upgrades: result.upgrades,
    }),
    null,
    2,
  )}\n`
