---
"projitect": minor
---

`tsconfig()` accepts `noEmit`, `allowJs`, `incremental`, `plugins` and `include` options, for
projects whose framework does the emitting and wants its own `tsconfig.json` keys (for example
Next.js). `noEmit: true` drops the emit settings; the other options add their field only when set.
Default output is unchanged.

New public options on a shipped blueprint → **minor** per the AGENTS.md "Versioning (lockstep)" table.
