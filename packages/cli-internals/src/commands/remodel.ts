import { Effect } from "effect"
import { StructX } from "@nunofyobiz/effect-extras"
import type { Errors, PjtLock, ProjitectConfig } from "@projitect/core"
import { loadBlueprintFile, isEffectTree } from "../loader.js"
import type { BlueprintTree, ProjitectFile } from "../loader.js"
import { buildPlan, diffLockfile } from "../plan.js"
import { applyPlan } from "../applier.js"
import { applyRemovals, assertNoAmbiguousMergeClaims } from "../remover.js"
import { makeProjectRootLayer, makeRealLayer } from "../filesystem-impl.js"
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
    const file = yield* loadBlueprintFile({
      blueprintFile: params.config.blueprintFile,
      projectRoot: params.config.projectRoot,
    })
    return yield* applyLoadedFile({ ...params, file })
  })

/** Apply an already imported configuration; build calls this only after its fresh-tree wipe. */
export const applyLoadedFile = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly file: ProjitectFile
  readonly spawner?: ProcessSpawner
}): Effect.Effect<RemodelResult, Errors.ProjitectError> =>
  Effect.gen(function* () {
    const { file, config, spawner } = params
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

    const { plan, byBlueprint } = yield* buildPlan({
      tree,
      projectRoot: config.projectRoot,
      layerFor: makeRealLayer,
    })
    return yield* Effect.gen(function* () {
      const previous = yield* readLockfile
      const { removals, legacyMergeClaims } = diffLockfile({ previous, current: byBlueprint })
      // Refuse before any write: nothing on disk, nor the lockfile, changes when a claim is ambiguous.
      yield* assertNoAmbiguousMergeClaims(legacyMergeClaims)

      const written = yield* applyPlan({ plan })
      const removed = yield* applyRemovals({ removals, live: plan.files })

      const nextLock: PjtLock.PjtLock = { version: 3, blueprints: byBlueprint }
      yield* writeLockfile({ lock: nextLock })

      const ran = yield* runPostApply({
        commands: plan.commands,
        projectRoot: config.projectRoot,
        ...StructX.defined("spawner", spawner),
      })

      return { written, removed, ran }
    }).pipe(Effect.provide(makeProjectRootLayer(config.projectRoot)))
  })
