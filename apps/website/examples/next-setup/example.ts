/**
 * Scaffold a Next.js (App Router) + TypeScript app from one `.pjt.ts` line. `next()` composes the
 * tsconfig, gitignore (`node`, `next` and `tsbuildinfo` sections) and vitest blueprints, so list it
 * instead of them, not next to them. Stack other region-mode blueprints (macOS, VS Code gitignore
 * sections) alongside it.
 */
import { pjt } from "projitect/cli"
import { gitignores } from "@projitect/blueprint-gitignore"
import { next } from "@projitect/blueprint-next"

export default pjt({
  blueprints: [gitignores.macOs(), gitignores.vscode(), next()],
})
