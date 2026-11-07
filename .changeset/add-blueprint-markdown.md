---
"projitect": minor
---

New `@projitect/blueprint-markdown` package: six composable `AGENTS.md` / `README.md` snippets
(`agentsPackageManager`, `agentsVerification`, `agentsCommits`, `agentsNoDestructiveShortcuts`,
`readmeContributing`, `readmeLicense`) built on `markdownSection`, each with a stable
`pjt:markdown:<file>:<snippet>` owner id and optional `version` / `content` overrides. `pjt add
@projitect/blueprint-markdown --section ...` adds them noninteractively.

New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.
