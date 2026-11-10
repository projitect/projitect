---
"@projitect/cli": major
---

Publish the CLI as `@projitect/cli`, so every first-party package belongs to the `@projitect`
organization. The executable remains `pjt`. Bootstrap with
`pnpm --package=@projitect/cli dlx pjt init`; `.pjt.ts` imports `pjt` from `@projitect/cli`.
Generated projects record `@projitect/cli` as their CLI devDependency. The previously planned
unscoped `projitect` package has not been published.
