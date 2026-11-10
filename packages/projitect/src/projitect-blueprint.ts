import { Effect } from "effect"
import { ChangeSet } from "@projitect/core"
import type { Blueprint } from "@projitect/core"

/**
 * The projitect blueprint. Automatically prepended to every user's blueprint tree by the `pjt()`
 * function exported from `@projitect/cli`. Owns everything projitect itself needs to stay coherent
 * in the host project:
 *
 *   - `package.json` keys: `scripts.pjt`, `devDependencies.@projitect/cli`, `devDependencies.effect`
 *     (merge mode — coexists with other tools touching package.json)
 *   - `.pjt.ts` region `pjt:projitect:imports`, containing the `import { pjt } from "@projitect/cli"`
 *     line (region mode — `pjt inspect` catches hand-edits that break the import)
 *
 * There's nothing special about this blueprint downstream of `pjt()`: it flows through the
 * standard planner, applier, lockfile pipeline like any other blueprint. The only "magic" is the
 * one-line prepend in `@projitect/cli`.
 *
 * The marker pairs `pjt:imports` and `pjt:blueprints` that `pjt add` splices into are **not**
 * managed regions — just conventions. If a user removes them, `pjt add` fails clearly with
 * `pjt.add.markers-missing` rather than overwriting their hand-edited file.
 */
export const projitectBlueprint = (versions: {
  readonly projitect: string
  readonly effect: string
}): Blueprint.Blueprint => ({
  id: "pjt:projitect:bootstrap",
  version: versions.projitect,
  description: "projitect's own bootstrap blueprint — keeps projitect wired into the project",
  permissions: [
    { kind: "write", glob: "package.json" },
    { kind: "read", glob: "package.json" },
    { kind: "write", glob: ".pjt.ts" },
    { kind: "read", glob: ".pjt.ts" },
  ],
  plan: Effect.succeed(
    ChangeSet.of(
      ChangeSet.MergeOp.make({
        ownerId: "pjt:projitect:bootstrap",
        path: "package.json",
        ownedKeys: ["scripts.pjt", "devDependencies.@projitect/cli", "devDependencies.effect"],
        value: {
          scripts: { pjt: "pjt" },
          devDependencies: {
            "@projitect/cli": `^${versions.projitect}`,
            effect: versions.effect,
          },
        },
      }),
      ChangeSet.RegionOp.make({
        ownerId: "pjt:projitect:imports",
        path: ".pjt.ts",
        commentPrefix: "//",
        content: 'import { pjt } from "@projitect/cli"\n',
      }),
    ),
  ),
})
