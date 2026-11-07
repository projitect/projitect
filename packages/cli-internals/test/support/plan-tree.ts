import { Array, Effect } from "effect"
import type { Blueprint, Errors } from "@projitect/core"
import { isDirectoryBlueprint } from "@projitect/blueprint"
import type { DirectoryBlueprint } from "@projitect/blueprint"
import { makeRealLayer } from "../../src/filesystem-impl.js"
import { buildPlan } from "../../src/plan.js"
import type { PlannedBlueprint } from "../../src/worker/protocol.js"

type Tree = readonly (Blueprint.Blueprint | DirectoryBlueprint)[]

const flatten = (
  tree: Tree,
  prefix: string,
): readonly { blueprint: Blueprint.Blueprint; directoryPrefix: string }[] =>
  Array.flatMap(tree, (node) =>
    isDirectoryBlueprint(node)
      ? flatten(node.children, prefix === "" ? node.name : `${prefix}/${node.name}`)
      : [{ blueprint: node, directoryPrefix: prefix }],
  )

/**
 * Test double for the confined worker: runs each live blueprint's plan in this process, behind the
 * same permission gate, and hands the results to `buildPlan` — so reducer tests need no child.
 */
export const planTree = (tree: Tree, projectRoot: string) =>
  Effect.forEach(flatten(tree, ""), ({ blueprint, directoryPrefix }) =>
    blueprint.plan.pipe(
      Effect.provide(
        makeRealLayer({
          blueprintId: blueprint.id,
          permissions: blueprint.permissions,
          projectRoot,
        }),
      ),
      Effect.map(
        (changeSet): PlannedBlueprint => ({
          id: blueprint.id,
          version: blueprint.version,
          permissions: blueprint.permissions,
          directoryPrefix,
          changeSet,
        }),
      ),
    ),
  ).pipe(Effect.flatMap((planned) => buildPlan({ planned }))) satisfies Effect.Effect<
    unknown,
    Errors.ProjitectError
  >
