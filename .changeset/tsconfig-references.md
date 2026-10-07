---
"projitect": minor
---

`tsconfig()` from `@projitect/blueprint-tsconfig` now accepts a `references` option: an array of
paths to referenced projects, written to the output as a top-level `references: [{ path }]` array
in the given order. This is the only supported way to get project references into an owned
`tsconfig.json` — TypeScript doesn't inherit `references` through `extends`, so the usual
`tsconfig.local.json` escape hatch can't express them. Omitting the option, or passing an empty
array, keeps today's output byte-identical.

New public option on a shipped blueprint → **minor** per the AGENTS.md "Versioning (lockstep)" table.
