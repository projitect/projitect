/**
 * Lint a project and auto-fix it. `eslint.config()` owns `eslint.config.mjs` and the lint scripts;
 * `eslint.fix()` runs `eslint --fix .` after every file is written. Exec operations run last and
 * in array order, so the position of `eslint.fix()` sets its sequence relative to other fixers.
 */
import { pjt } from "@projitect/cli"
import { eslint } from "@projitect/blueprint-eslint"
import { gitignores } from "@projitect/blueprint-gitignore"

export default pjt({
  blueprints: [
    gitignores.macOs(),
    gitignores.node(),
    eslint.config({ ignores: ["build"] }),
    eslint.fix(),
  ],
})
