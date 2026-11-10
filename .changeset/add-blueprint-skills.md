---
"@projitect/cli": minor
---

New `@projitect/blueprint-skills` package. `skills({ id, version, skills, target? })` installs
agent skills (`SKILL.md` plus referenced files) under `.claude/skills` or a custom target, in
owned mode so `pjt inspect` catches drift. New `pjt.skills.invalid-path` error. `pjt remodel` now
also removes owned files a still-installed blueprint stops shipping (never a path another blueprint
now owns), and `ownFile` accepts an `ownedDir` so only that directory tree is pruned when empty.

New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.
