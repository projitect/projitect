/**
 * Monorepo example. `directory("packages/foo", [...])` re-roots the child blueprints' paths
 * inside the named subdirectory and intersects their write permissions with that subtree.
 *
 * Here, each workspace package gets its own scoped `.gitignore` slice for the Node-specific
 * patterns it cares about, while the root `.gitignore` carries OS-level entries.
 */
import { pjt, directory } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"

export default pjt({
  blueprints: [
    gitignores.macOs(),
    gitignores.linux(),
    gitignores.windows(),
    directory("packages/api", [gitignores.node()]),
    directory("packages/web", [gitignores.node(), gitignores.next()]),
  ],
})
