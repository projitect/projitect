---
"projitect": minor
---

`@projitect/blueprint` now exports the `.pjt.ts` splice (`spliceBlueprintFile`) and the `pjt add`
section selection (`resolveSections`, `computeSplice`, `chooseSectionsInteractive`,
`SectionStrategy`, `ProjitectPackageMetadata`). Fix: cancelling the `pjt add` section picker with
Ctrl-C, or confirming it with nothing ticked, no longer adds every section; `.pjt.ts` is left
unchanged.

New SDK helpers → **minor** per the AGENTS.md "Versioning (lockstep)" table.
