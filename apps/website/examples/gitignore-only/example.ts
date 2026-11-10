/**
 * Minimum-viable `.pjt.ts`. Three gitignore sections, no Effect, no conditional logic.
 * Most projects start here and grow as the blueprint catalog does.
 */
import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"

export default pjt({
  blueprints: [gitignores.macOs(), gitignores.node(), gitignores.vscode()],
})
