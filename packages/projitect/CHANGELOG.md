# projitect

## 1.0.0

### Major Changes

- [#57](https://github.com/projitect/projitect/pull/57) [`36787a7`](https://github.com/projitect/projitect/commit/36787a79be810ebab11cb4562f92828cc798cada) Thanks [@bigpopakap](https://github.com/bigpopakap)! - The `@projitect/cli-internals` engine (`readLockfile`, `writeLockfile`, `diffPlan`, `applyPlan`,
  `applyRemovals`) now reads and writes through the `BlueprintFileSystem` service instead of
  `node:fs`, so it can run against the in-memory filesystem. CLI behavior is unchanged.

  Migration for direct callers: drop the `projectRoot` argument, provide the new
  `makeProjectRootLayer(projectRoot)` (or any `BlueprintFileSystem` layer, such as test-kit's
  `makeInMemoryLayer`), and use `readLockfile` as an Effect value rather than calling it. The `path`
  on `pjt.lock.parse-failed` is now the project-relative `.pjt.lock`.

  `BlueprintFileSystem.remove` is no longer recursive: it removes a file or symlink and fails with
  `pjt.fs.write-failed` on a directory, so user content that replaced a formerly owned file is never
  deleted. Blueprint code that relied on recursive removal must list and remove entries itself.

  Major per the AGENTS.md "Versioning (lockstep)" table: exported function signatures changed.

### Minor Changes

- [#45](https://github.com/projitect/projitect/pull/45) [`5ddcf2c`](https://github.com/projitect/projitect/commit/5ddcf2c8c75fe2c316e5583654273e9d09770d58) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New `@projitect/blueprint-changesets` package. `changesets()` owns `.changeset/config.json` and
  merges the `changeset` / `version-packages` scripts and the `@changesets/cli` devDependency into
  `package.json`, with `baseBranch`, `access`, `fixed`, `linked`, `ignore` and `changelog` options.

  New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#52](https://github.com/projitect/projitect/pull/52) [`4d767ad`](https://github.com/projitect/projitect/commit/4d767adb1f9b0ab2fc01c8040e545dff0cff933d) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New `@projitect/blueprint-husky-lint-staged` package. `huskyLintStaged()` owns `.husky/pre-commit`
  and merges the `lint-staged` field, the `prepare` script (`husky`) and the `husky` and
  `lint-staged` devDependencies into `package.json`, with a `config` option that replaces the default
  lint-staged config.

  New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#54](https://github.com/projitect/projitect/pull/54) [`52917b8`](https://github.com/projitect/projitect/commit/52917b828b6649187ccb17c7df29e9cc6a13172f) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New `@projitect/blueprint-markdown` package: six composable `AGENTS.md` / `README.md` snippets
  (`agentsPackageManager`, `agentsVerification`, `agentsCommits`, `agentsNoDestructiveShortcuts`,
  `readmeContributing`, `readmeLicense`) built on `markdownSection`, each with a stable
  `pjt:markdown:<file>:<snippet>` owner id and optional `version` / `content` overrides. `pjt add
@projitect/blueprint-markdown --section ...` adds them noninteractively.

  New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#69](https://github.com/projitect/projitect/pull/69) [`522362e`](https://github.com/projitect/projitect/commit/522362e9b9bc44b40eb4e24febe27893b1b50f79) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New `@projitect/blueprint-react` package. `react()` scaffolds a React + Vite + TypeScript app: it
  composes the tsconfig, gitignore (`node` section) and vitest (jsdom) blueprints, owns
  `vite.config.ts`, merges the `dev` / `build` / `preview` scripts and the React, Vite and testing
  dependencies into `package.json`, adds `dist/` to `.gitignore`, and seeds the starter source
  (`index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/index.css`) once, never
  enforcing it afterwards.

  New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#53](https://github.com/projitect/projitect/pull/53) [`f001298`](https://github.com/projitect/projitect/commit/f00129868ba4f8e552c4c0c8aa1dd6bd766a29d4) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New `@projitect/blueprint-skills` package. `skills({ id, version, skills, target? })` installs
  agent skills (`SKILL.md` plus referenced files) under `.claude/skills` or a custom target, in
  owned mode so `pjt inspect` catches drift. New `pjt.skills.invalid-path` error. `pjt remodel` now
  also removes owned files a still-installed blueprint stops shipping (never a path another blueprint
  now owns), and `ownFile` accepts an `ownedDir` so only that directory tree is pruned when empty.

  New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#58](https://github.com/projitect/projitect/pull/58) [`5ec29b1`](https://github.com/projitect/projitect/commit/5ec29b12fc3227ad259dad091288a7874759be4d) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Add the `pjt.exec.command-failed` and `pjt.exec.command-not-permitted` error ids, a process runner,
  and enforcement of the `exec` permission (exact command-string match). Nothing is wired into
  `build`, `remodel` or `inspect` yet.

  New error ids → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#10](https://github.com/projitect/projitect/pull/10) [`1d2cfd7`](https://github.com/projitect/projitect/commit/1d2cfd75a0ba6257df0f7b5d659ebe60f2c9ae30) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `ChangeSet` is now a first-class monoid: it exports a `ChangeSet.Reducer` (identity `empty`,
  associative `concat`) so composite blueprints can fold their parts with
  `ChangeSet.Reducer.combineAll(changeSets)` instead of hand-concatenating operation arrays.

- [#1](https://github.com/projitect/projitect/pull/1) [`3cd98d6`](https://github.com/projitect/projitect/commit/3cd98d6e1eb4febe518c005974db9302aa264a04) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Initial v0 release. Region-mode end-to-end, eight gitignore blueprint sections, `pjt init`,
  `pjt remodel`, `pjt inspect`, `pjt explain`. CI-grade drift detection. Merge / owned / seed
  modes are scaffolded but not yet exercised by a shipping blueprint. Built on Effect v4 RC.

- [#43](https://github.com/projitect/projitect/pull/43) [`3234918`](https://github.com/projitect/projitect/commit/3234918f8f394796e0e62dc30541315c8fef4d4d) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `pjt inspect --json` now carries a `$schema` key naming a published, versioned JSON Schema
  (draft 2020-12) at `https://projitect.dev/schemas/inspect.v1.json`. The schema is generated
  from the same definition the command encodes its output through, so it can't drift from the
  code, and it accepts unknown additional keys so future minor releases can add fields without
  breaking consumers.

- [#49](https://github.com/projitect/projitect/pull/49) [`32d40ee`](https://github.com/projitect/projitect/commit/32d40eef9f143df0d9771fbbdf77952d24939b78) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Permission globs support `{a,b}` alternation (including multiple, empty and nested groups), so a
  blueprint can declare `src/**/*.{ts,tsx}` instead of one entry per extension.

  New public feature → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#67](https://github.com/projitect/projitect/pull/67) [`055a258`](https://github.com/projitect/projitect/commit/055a2589ea0c5888f051d93ff185b5e897fb8b32) Thanks [@bigpopakap](https://github.com/bigpopakap)! - The `init` → `add` → `remodel` → `inspect` journey now works end to end, in a terminal and without
  one. `pjt add` shows its interactive section picker in a real terminal (the Node terminal layer
  reads keypresses, and Ctrl-C leaves `.pjt.ts` unchanged). `pjt add` of a package without
  `projitect` metadata now fails with the new `pjt.add.metadata-missing` error instead of printing a
  notice and exiting 0. Plan-conflict, dirty-git, missing-git and drift messages now name the next
  command to run. The website gains an "Install guidance and skills" guide and a checked GitHub
  Actions workflow for `pjt inspect`.

  New error id → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#64](https://github.com/projitect/projitect/pull/64) [`e7feab8`](https://github.com/projitect/projitect/commit/e7feab88ab8110487267d63194f4a9f86c6b40f0) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `pjt build` and `pjt remodel` run a ChangeSet's `Exec` commands in a final phase after every file
  operation has succeeded, gated by the blueprint's `exec` permission. `--json` is accepted by
  `build` and `remodel` and carries the result or the error's id and fields. `pjt inspect` fails with
  the new `pjt.inspect.operation-unsupported` error id when a project declares commands.

  New error id → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#51](https://github.com/projitect/projitect/pull/51) [`1944017`](https://github.com/projitect/projitect/commit/194401707f79dd79abc3df939cd1f497e7f0af46) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `@projitect/blueprint` now exports the `.pjt.ts` splice (`spliceBlueprintFile`) and the `pjt add`
  section selection (`resolveSections`, `computeSplice`, `chooseSectionsInteractive`,
  `SectionStrategy`, `ProjitectPackageMetadata`). Fix: cancelling the `pjt add` section picker with
  Ctrl-C, or confirming it with nothing ticked, no longer adds every section; `.pjt.ts` is left
  unchanged.

  New SDK helpers → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#41](https://github.com/projitect/projitect/pull/41) [`433bd77`](https://github.com/projitect/projitect/commit/433bd77f26dc294b93ce5abd3be9a4e67bcb75fc) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `tsconfig()` accepts an optional `references` array of project paths, emitted as top-level
  `references: [{ path }]` entries so project-references monorepos can use the owned `tsconfig.json`.
  Omitted or empty output is unchanged.

  New public option on a shipped blueprint → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#55](https://github.com/projitect/projitect/pull/55) [`24ab161`](https://github.com/projitect/projitect/commit/24ab16119b4b9214ba4fed1122066eef32d7df64) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New worker error ids — `pjt.worker.crashed`, `pjt.worker.timed-out` and `pjt.worker.exited-early` —
  with error pages and `pjt explain` entries. Blueprint file access now resolves symlinks and
  re-checks permissions against the real path, so a link pointing outside the project is denied.
  `@projitect/cli-internals` gains an IPC protocol, server and client for `BlueprintFileSystem`.

  New public error ids → **minor** per the AGENTS.md "Versioning (lockstep)" table.

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

- [#75](https://github.com/projitect/projitect/pull/75) [`4b13258`](https://github.com/projitect/projitect/commit/4b13258561d6e596b83abecfc52003238dba4919) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Report the installed package version from the gitignore, tsconfig, vitest, changesets and husky-lint-staged blueprints, so `pjt inspect` detects their upgrades.

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

- [#63](https://github.com/projitect/projitect/pull/63) [`ec811d1`](https://github.com/projitect/projitect/commit/ec811d1a2db91ac93644ce5b046609f63c483025) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Include the owner-confirmed MIT license in the agent-skills and Husky/lint-staged package tarballs.

- Updated dependencies [[`3cd98d6`](https://github.com/projitect/projitect/commit/3cd98d6e1eb4febe518c005974db9302aa264a04)]:
  - @projitect/core@1.0.0
  - @projitect/blueprint@1.0.0
  - @projitect/cli-internals@1.0.0
