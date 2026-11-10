/**
 * Effect-form blueprint file. The `next` gitignore section only loads if `package.json` lists
 * `next` as a dependency, demonstrating how to branch on detected project state.
 *
 * The simple-array form covers most cases; reach for the Effect form when you need to read FS
 * state or compose multiple blueprints conditionally.
 */
import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { readPackageJson } from "@projitect/blueprint"
import { Effect } from "effect"

export default pjt({
  blueprints: Effect.gen(function* () {
    const pkg = yield* readPackageJson
    const hasNext =
      typeof pkg === "object" &&
      pkg !== null &&
      "dependencies" in pkg &&
      pkg.dependencies !== null &&
      typeof pkg.dependencies === "object" &&
      "next" in (pkg.dependencies as Record<string, unknown>)

    return [gitignores.macOs(), gitignores.node(), ...(hasNext ? [gitignores.next()] : [])]
  }),
})
