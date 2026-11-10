import { Effect } from "effect"
import { StructX } from "@nunofyobiz/effect-extras"
import type { Errors, PjtLock, ProjitectConfig } from "@projitect/core"
import { planBlueprintFile } from "../worker/host.js"
import { buildPlan, diffLockfile } from "../plan.js"
import { applyPlan } from "../applier.js"
import { applyRemovals } from "../remover.js"
import { makeProjectRootLayer } from "../filesystem-impl.js"
import { readLockfile, writeLockfile } from "../lockfile.js"
import { runPostApply } from "../post-apply.js"
import type { ProcessSpawner } from "../platform/process-runner.js"

export interface RemodelResult {
  readonly written: readonly string[]
  readonly removed: readonly string[]
  /** Post-apply commands that ran, deduplicated, in the order they ran. */
  readonly ran: readonly string[]
}

/**
 * `pjt remodel` — load blueprints, build the plan, apply changes to disk, rewrite `.pjt.lock`,
 * then run the blueprints' post-apply commands.
 * Non-destructive at the file-tree level: only touches files the plan covers (additions) and
 * files where a blueprint that previously had ownership left the tree (removals). Commands run
 * only after every file operation and the lockfile write have succeeded. `spawner` replaces the
 * real process spawner in tests.
 */
export const remodel = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly spawner?: ProcessSpawner
}): Effect.Effect<RemodelResult, Errors.ProjitectError> =>
  Effect.gen(function* () {
    const planned = yield* planBlueprintFile({
      blueprintFile: params.config.blueprintFile,
      projectRoot: params.config.projectRoot,
    })
    const { plan, byBlueprint } = yield* buildPlan({ planned })
    return yield* Effect.gen(function* () {
      const previous = yield* readLockfile
      const { removals } = diffLockfile({ previous, current: byBlueprint })

      const written = yield* applyPlan({ plan })
      const removed = yield* applyRemovals({ removals })

      const nextLock: PjtLock.PjtLock = { version: 2, blueprints: byBlueprint }
      yield* writeLockfile({ lock: nextLock })

      const ran = yield* runPostApply({
        commands: plan.commands,
        projectRoot: params.config.projectRoot,
        ...StructX.defined("spawner", params.spawner),
      })

      return { written, removed, ran }
    }).pipe(Effect.provide(makeProjectRootLayer(params.config.projectRoot)))
  })
