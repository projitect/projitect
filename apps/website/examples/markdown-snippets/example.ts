/**
 * Share Markdown snippets across AGENTS.md and README.md. Three first-party snippets plus one of
 * your own, built on `markdownSection`. Each snippet owns a comment-fenced region, so they coexist
 * in one file, and everything you write outside the markers stays yours.
 */
import { pjt } from "@projitect/cli"
import { markdownSection } from "@projitect/blueprint"
import { markdownSnippets } from "@projitect/blueprint-markdown"

// A snippet of your own. The id is its stable owner id: keep it fixed across versions and bump
// `version` when the content changes.
const teamNotes = markdownSection({
  id: "acme:agents:team-notes",
  version: "1.0.0",
  path: "AGENTS.md",
  content: "## Team notes\n\nPing #platform before changing the release workflow.\n",
})

export default pjt({
  blueprints: [
    markdownSnippets.agentsVerification(), // AGENTS.md  pjt:markdown:agents:verification
    markdownSnippets.agentsCommits(), //      AGENTS.md  pjt:markdown:agents:commits
    markdownSnippets.readmeLicense(), //      README.md  pjt:markdown:readme:license
    teamNotes,
  ],
})
