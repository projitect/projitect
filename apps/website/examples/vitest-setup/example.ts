/**
 * Scaffold a project with vitest configured for testing — config file, scripts, devDeps, and
 * the `coverage/` gitignore entry all in one `.pjt.ts` line. Stack with gitignore sections as
 * usual; the vitest blueprint coexists with the others because it owns its own region in
 * `.gitignore`.
 */
import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { vitest } from "@projitect/blueprint-vitest"

export default pjt({
  blueprints: [gitignores.macOs(), gitignores.node(), vitest()],
})
