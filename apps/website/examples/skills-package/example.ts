/**
 * Package agent skills as a blueprint. Each skill is a `SKILL.md` plus any referenced scripts and
 * assets; consumers install the package and call the exported blueprint in their `.pjt.ts`.
 */
import { pjt } from "@projitect/cli"
import { skills } from "@projitect/blueprint-skills"

// What a skill package builds and exports from its entry point. Pass the package's own version so `pjt remodel` sees upgrades,
// and a stable, namespaced `id` so two skill packages never share an owner.
const acmeSkills = skills({
  id: "acme:skills",
  version: "1.2.0",
  skills: [
    {
      name: "release-notes",
      files: {
        "SKILL.md": "---\nname: release-notes\ndescription: Draft release notes\n---\nRun scripts/collect.sh.\n",
        "scripts/collect.sh": "git log --oneline\n",
        "assets/templates/notes.md": "# Release notes\n",
      },
    },
  ],
})

// What a consumer writes. `target` is optional and defaults to ".claude/skills".
export default pjt({
  blueprints: [acmeSkills, skills({ id: "acme:agents", version: "1.2.0", target: ".agents/skills", skills: [] })],
})
