---
"projitect": major
---

`@projitect/cli-internals` ships a browser-safe engine entry, `@projitect/cli-internals/browser`:
`buildPlan`, `diffLockfile`, `diffPlan`, `applyPlan`, `applyRemovals`, the lockfile functions, a
permission `makeGatedLayer` over any `BlueprintFileSystem`, and `evaluatePjt`, which turns `.pjt.ts`
text into its blueprint list in the browser (types stripped with `sucrase`, imports resolved from a
caller-supplied registry). `@projitect/cli-internals/browser-blueprints` exports `firstPartyRegistry`,
the registry of the first-party blueprint packages (optional peer dependencies). No `node:*` module
is reachable from either entry, and a bundling test enforces it. `evaluatePjt` runs the text as JavaScript and is not a security sandbox: hosts must isolate untrusted
snippets. CLI behavior is unchanged.

Migration for direct callers of `buildPlan`: pass the new required `layerFor` argument. The CLI passes
`makeRealLayer`; a browser passes a `makeGatedLayer` over an in-memory layer. The planner no longer
imports the Node-backed filesystem.

Major per the AGENTS.md "Versioning (lockstep)" table: an exported function signature changed.
