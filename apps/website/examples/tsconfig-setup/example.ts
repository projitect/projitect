/**
 * Stack a strict, owned `tsconfig.json` alongside the gitignore and vitest blueprints. The
 * tsconfig blueprint owns the whole file content — `pjt remodel` rewrites it from scratch, so
 * the strictness floor can't drift over time.
 *
 * For project-specific overrides projitect's options can't model (e.g. `compilerOptions.paths`),
 * create a `tsconfig.local.json` that extends `tsconfig.json` and adds the override there.
 * The blueprint never touches files it doesn't own. Project `references` are the exception —
 * TypeScript doesn't inherit them through `extends`, so pass them to `tsconfig({ references })`.
 */
import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { vitest } from "@projitect/blueprint-vitest"
import { tsconfig } from "@projitect/blueprint-tsconfig"

export default pjt({
  blueprints: [gitignores.macOs(), gitignores.node(), vitest(), tsconfig()],
})
