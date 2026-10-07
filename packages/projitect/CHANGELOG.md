# projitect

## 1.0.0

### Minor Changes

- [#10](https://github.com/projitect/projitect/pull/10) [`1d2cfd7`](https://github.com/projitect/projitect/commit/1d2cfd75a0ba6257df0f7b5d659ebe60f2c9ae30) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `ChangeSet` is now a first-class monoid: it exports a `ChangeSet.Reducer` (identity `empty`,
  associative `concat`) so composite blueprints can fold their parts with
  `ChangeSet.Reducer.combineAll(changeSets)` instead of hand-concatenating operation arrays.

- [#1](https://github.com/projitect/projitect/pull/1) [`3cd98d6`](https://github.com/projitect/projitect/commit/3cd98d6e1eb4febe518c005974db9302aa264a04) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Initial v0 release. Region-mode end-to-end, eight gitignore blueprint sections, `pjt init`,
  `pjt remodel`, `pjt inspect`, `pjt explain`. CI-grade drift detection. Merge / owned / seed
  modes are scaffolded but not yet exercised by a shipping blueprint. Built on Effect v4 RC.

### Patch Changes

- [#11](https://github.com/projitect/projitect/pull/11) [`6d77435`](https://github.com/projitect/projitect/commit/6d7743508bd975db2b29e931037be42c4725cd32) Thanks [@bigpopakap](https://github.com/bigpopakap)! - projitect's generic `*X` utilities now come entirely from the published `@nunofyobiz/effect-extras`
  package (v3) — the in-repo `@projitect/internal` package is deleted. `StructX`,
  `PredicateX.isNonEmptyString` / `unsafeIsRecord`, `NonNullableX.match`, the `RecordX` JSON-tree ops
  (`deepMerge` / `deepMergeReducer` / `canonicalize` / `deleteByPath`), and the `StringX` line-editing
  helpers (`replaceLineRange` / `insertBeforeLine`) are all imported from the package. `effect` is
  pinned to the exact `4.0.0-rc.111` release candidate, with effect-extras updated to v3.2.

  Internal refactor + dependency change with no change to any public API (Blueprint / ChangeSet /
  Permission shapes, CLI flags, error ids, lockfile schema all unchanged) → **patch** per the
  AGENTS.md "Versioning (lockstep)" table.

- [#29](https://github.com/projitect/projitect/pull/29) [`f66712a`](https://github.com/projitect/projitect/commit/f66712a3805901a6c2d65a0b8582982b8ef69f18) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Migrate the lockstep package suite to `effect@4.0.0-rc.111`. Published peer dependencies now
  require the release candidate, serialized errors use the RC `Schema.TaggedError` API, and the Node
  platform layer implements the RC filesystem glob contract. CLI boolean flags retain their existing
  optional, default-false behavior.

- [#39](https://github.com/projitect/projitect/pull/39) [`0e42d70`](https://github.com/projitect/projitect/commit/0e42d706ca95471b340d81802d0b0d6769f0b6d7) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Every published package now declares a `repository` field pointing at
  `github.com/projitect/projitect`, the project's current canonical GitHub home. The changesets
  changelog generator and the marketing site's GitHub links (header icon, homepage "View on GitHub"
  action) now target the same repository instead of the stale `kapilkale/projitect` slug.

  Doc/metadata change only, no API change → **patch** per the AGENTS.md "Versioning (lockstep)"
  table.

- Updated dependencies [[`3cd98d6`](https://github.com/projitect/projitect/commit/3cd98d6e1eb4febe518c005974db9302aa264a04)]:
  - @projitect/core@1.0.0
  - @projitect/blueprint@1.0.0
  - @projitect/cli-internals@1.0.0
