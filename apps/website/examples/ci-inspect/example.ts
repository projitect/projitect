/**
 * The `.pjt.ts` that `inspect.yml` guards. CI installs the locked packages, then `pnpm pjt inspect`
 * compares this plan with the committed files and `.pjt.lock`: it exits 0 when they agree and 1
 * when someone hand-edited a managed region or upgraded a blueprint without running `pjt remodel`.
 */
import { pjt } from "projitect/cli"
import { markdownSnippets } from "@projitect/blueprint-markdown"
import { gitignores } from "@projitect/blueprint-gitignore"

export default pjt({
  blueprints: [
    gitignores.node(), //                       .gitignore  pjt:gitignore:node
    markdownSnippets.agentsVerification(), //   AGENTS.md   pjt:markdown:agents:verification
    markdownSnippets.agentsCommits(), //        AGENTS.md   pjt:markdown:agents:commits
  ],
})
