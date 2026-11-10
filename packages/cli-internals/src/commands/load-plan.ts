import { Effect } from "effect"
import type { ProjitectConfig } from "@projitect/core"
import { buildPlan } from "../plan.js"
import { planBlueprintFile } from "../worker/host.js"

/** Run the project's `.pjt.ts` in the confined worker and build the plan — the shared front half of `inspect` and `explain`. */
export const loadProjectPlan = (config: ProjitectConfig.ProjitectConfig) =>
  Effect.gen(function* () {
    const planned = yield* planBlueprintFile({
      blueprintFile: config.blueprintFile,
      projectRoot: config.projectRoot,
    })
    return yield* buildPlan({ planned })
  })
