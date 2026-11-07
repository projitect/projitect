---
"projitect": minor
---

New `@projitect/blueprint-skills` package. `skills({ skills, target?, id?, version? })` installs
agent skills (`SKILL.md` plus referenced files) under `.claude/skills` or a custom target, in
owned mode so `pjt inspect` catches drift. New `pjt.skills.invalid-path` error. `pjt remodel` now
also removes owned files a still-installed blueprint stops shipping, and prunes directories left
empty.

New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.
