/**
 * `eslint.config()` on its own is valid: projitect writes the config and scripts, and nothing
 * runs `eslint --fix` for you.
 */
import { pjt } from "@projitect/cli"
import { eslint } from "@projitect/blueprint-eslint"

export default pjt({
  blueprints: [eslint.config({ prettier: "config" })],
})
