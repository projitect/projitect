---
"projitect": minor
---

`tsconfig()` accepts an optional `references` array of project paths, emitted as top-level
`references: [{ path }]` entries so project-references monorepos can use the owned `tsconfig.json`.
Omitted or empty output is unchanged.

New public option on a shipped blueprint → **minor** per the AGENTS.md "Versioning (lockstep)" table.
