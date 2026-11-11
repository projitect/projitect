/**
 * Keep a project formatted — the Prettier config, the `format` script and the `prettier`
 * devDependency from `prettier.config()`, plus a post-apply `prettier --write` from `prettier.fix()`.
 * `packageManager` picks the runner that finds the project-local `prettier`.
 */
import { pjt } from "@projitect/cli"
import { prettier } from "@projitect/blueprint-prettier"

export default pjt({
  blueprints: [
    prettier.config({ semi: false, singleQuote: true, printWidth: 100 }),
    prettier.fix({ packageManager: "pnpm" }),
  ],
})
