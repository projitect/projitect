/**
 * The starter `.pjt.ts` of the in-browser demo. The demo page loads this file into its editor,
 * evaluates it in the visitor's own tab and plans it against a small in-memory project. Add
 * `changesets()` or `react()`, or drop a line, and the plan and drift output change with it. Note that
 * `react()` already includes `tsconfig()`, `vitest()` and `gitignores.node()`.
 */
import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { tsconfig } from "@projitect/blueprint-tsconfig"
import { vitest } from "@projitect/blueprint-vitest"

export default pjt({
  blueprints: [gitignores.macOs(), gitignores.node(), tsconfig(), vitest()],
})
