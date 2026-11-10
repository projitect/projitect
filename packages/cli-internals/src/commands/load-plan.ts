import { Effect } from "effect"
import type { ProjitectConfig } from "@projitect/core"
import { loadBlueprintFile, isEffectTree } from "../loader.js"
import type { BlueprintTree } from "../loader.js"
import { buildPlan } from "../plan.js"
import { makeRealLayer } from "../filesystem-impl.js"

/** Load the project's `.pjt.ts`, resolve its blueprint tree and build the plan — the shared front half of `inspect` and `explain`. */
export const loadProjectPlan = (config: ProjitectConfig.ProjitectConfig) =>
  Effect.gen(function* () {
    const file = yield* loadBlueprintFile({
      blueprintFile: config.blueprintFile,
      projectRoot: config.projectRoot,
    })
    const tree: BlueprintTree = isEffectTree(file.blueprints)
      ? yield* file.blueprints.pipe(
          Effect.provide(
            makeRealLayer({
              blueprintId: "pjt:config-loader",
              permissions: [{ kind: "read", glob: "**" }],
              projectRoot: config.projectRoot,
            }),
          ),
        )
      : file.blueprints
    return yield* buildPlan({ tree, projectRoot: config.projectRoot })
  })
