---
"projitect": patch
---

projitect's generic `*X` utilities now come entirely from the published `@nunofyobiz/effect-extras`
package (v3) — the in-repo `@projitect/internal` package is deleted. `StructX`,
`PredicateX.isNonEmptyString` / `unsafeIsRecord`, `NonNullableX.match`, the `RecordX` JSON-tree ops
(`deepMerge` / `deepMergeReducer` / `canonicalize` / `deleteByPath`), and the `StringX` line-editing
helpers (`replaceLineRange` / `insertBeforeLine`) are all imported from the package. `effect` is
pinned to the exact `4.0.0-rc.111` release candidate, with effect-extras updated to v3.2.

Internal refactor + dependency change with no change to any public API (Blueprint / ChangeSet /
Permission shapes, CLI flags, error ids, lockfile schema all unchanged) → **patch** per the
AGENTS.md "Versioning (lockstep)" table.
