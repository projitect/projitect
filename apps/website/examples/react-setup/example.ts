/**
 * Scaffold a React + Vite + TypeScript app from one `.pjt.ts` line. `react()` composes the
 * tsconfig, gitignore (`node` section) and vitest blueprints, so list it instead of them, not
 * next to them. Stack other region-mode blueprints (macOS, VS Code gitignore sections) alongside it.
 */
import { pjt } from "@projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { react } from "@projitect/blueprint-react"

export default pjt({
  blueprints: [gitignores.macOs(), gitignores.vscode(), react()],
})
