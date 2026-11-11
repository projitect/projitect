# @projitect/cli

## 2.0.0

### Major Changes

- [#81](https://github.com/projitect/projitect/pull/81) [`2668995`](https://github.com/projitect/projitect/commit/26689959eaf04b0edc1413a9dea0424e46883649) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `@projitect/cli-internals` ships a browser-safe engine entry, `@projitect/cli-internals/browser`:
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

  Core's portable default `projectRoot` is now `/` rather than reading `process.cwd()` during import.
  Direct callers of `ProjitectConfig.resolve` supply their host root explicitly when needed. The Node
  CLI dispatch still supplies its current working directory and retains all override layers.

  Major per the AGENTS.md "Versioning (lockstep)" table: an exported function signature changed.

- [#99](https://github.com/projitect/projitect/pull/99) [`1c2b418`](https://github.com/projitect/projitect/commit/1c2b4189a55ec83e6296d76332171a283c8c3660) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `BlueprintFileSystem` gains required `readFileBytes` and `writeFileBytes` (`Uint8Array`), gated by
  the same read and write permissions as the text methods and carried exactly over the IPC
  transport, so every implementation of the interface must add them. The `.pjt.lock` schema moves
  to version 2, which adds an optional per-entry `contentHash`; projitect still reads version 1
  lockfiles and writes version 2.

  Public file system shape and lockfile schema change → **major** per the AGENTS.md "Versioning
  (lockstep)" table.

- [#96](https://github.com/projitect/projitect/pull/96) [`7147b78`](https://github.com/projitect/projitect/commit/7147b78acd9b5c5f3cf89195728733bd62ac1b4e) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `pjt inspect` runs the check command of every post-apply `Exec` operation through the
  permission-gated runner and reports a failing check as drift (exit 1). `inspect --json` gains a
  `commands` array with one entry per failing check. `pjt explain` with no error id lists the
  project's post-apply commands, in text or with `--json`.

  **Breaking:** the `pjt.inspect.operation-unsupported` error id, the `OperationUnsupportedOnInspect`
  class and the `InspectError` type are removed from `@projitect/core`. Migration: `pjt inspect` now
  runs each command's `check`, reports a failing check as drift, and no longer returns that error;
  remove any handling of the old id and gate CI on the exit code or the `commands` array.

- [#117](https://github.com/projitect/projitect/pull/117) [`8f080e0`](https://github.com/projitect/projitect/commit/8f080e030fda1f3a8ede1d00fa0e4f11cbafe00c) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Validate JSON merge ownership before anything is written, and remove only the fields a blueprint wrote. Two blueprints claiming a key and one of its descendants (`scripts` and `scripts.test`) now fail with `pjt.plan.conflict-merge` in either declaration order, judged on dotted-path segments. A merge blueprint that writes a field its `ownedKeys` do not cover fails with the new `pjt.plan.unowned-merge-write`. One blueprint declaring a key and its own descendant owns the ancestor. `.pjt.lock` moves to version 3: each merge entry records the fields the blueprint wrote (`writtenPaths`), and removing a blueprint deletes only those fields, so children you added under an owned key and keys another blueprint claims stay. A version 1 or 2 lock stays readable and is rewritten as version 3 by the next `pjt remodel`; a lock written by version 3 is rejected by older projitect with `pjt.lock.version-mismatch`. When a blueprint leaves `.pjt.ts` while its pre-v3 lock entry only records a parent key over an object, `pjt remodel` refuses with the new `pjt.remove.ambiguous-merge-claim` before writing anything, and `pjt inspect` reports it. A merge write that would replace an array, string, number or `null` your file holds above an unowned field fails with the new `pjt.apply.merge-ancestor-not-object` before anything is written; removal leaves a recorded field that now holds an object with your children alone, and a blueprint that upgrades a field from a value to an object keeps the new fields. Major because the lockfile schema version bumps, which the versioning table rates as a breaking change.

### Minor Changes

- [#107](https://github.com/projitect/projitect/pull/107) [`d7cd5ff`](https://github.com/projitect/projitect/commit/d7cd5ff6023f6912ffe7814a18b5466ae0cf955a) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `pjt add` now accepts versioned specs such as `@scope/name@1.2.3`, `name@^1` and `@scope/name@latest`: the package manager receives the full spec and metadata is read from the resolved package name. Aliases, URL, tarball, file, git and workspace specs, and names that could escape `node_modules`, are rejected before install with the new `pjt.add.spec-unsupported` error. `pjt.add.metadata-missing` now names the package instead of the raw spec.

### Patch Changes

- [#116](https://github.com/projitect/projitect/pull/116) [`3889ace`](https://github.com/projitect/projitect/commit/3889ace4142baf35dd8334c415c75ead5324f021) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Post-apply fix commands and inspect checks now find tools installed in the project: a bare program
  name resolves from `<projectRoot>/node_modules/.bin` first, then the system `PATH`, so `pjt` no longer
  needs a package-manager wrapper to run `eslint` and the like (it failed with `spawn eslint ENOENT`).
  Explicit paths run as given, operators stay literal (no shell), and `process.env` is never modified.
  A tool found nowhere still fails with `pjt.exec.command-failed`, and the message now lists where it
  looked. On Windows, a program, argument or resolved path containing `%`, a line break or NUL is
  refused with `pjt.exec.command-failed` instead of being altered by `cmd.exe`. Adds the `which` and `cross-spawn` dependencies to `@projitect/cli-internals`.

- [#108](https://github.com/projitect/projitect/pull/108) [`262fd6a`](https://github.com/projitect/projitect/commit/262fd6a5d9fbd3b2fd214b1a078ec195c767221d) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `pjt add @projitect/blueprint-skills` now splices a valid default call with a namespaced `id` and a `version`, so the next `pjt remodel` succeeds. A missing or invalid `id` or `version` fails with `pjt.skills.invalid-path` instead of a TypeError.

- Updated dependencies []:
  - @projitect/blueprint@2.0.0
  - @projitect/cli-internals@2.0.0
  - @projitect/core@2.0.0

## 1.0.1

### Patch Changes

- [#104](https://github.com/projitect/projitect/pull/104) [`c4241e2`](https://github.com/projitect/projitect/commit/c4241e202dc9a7fa282da0e203660efa1c649fe1) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Make `pjt init` work when invoked through `pnpm dlx` in a project without local dependencies.
  Install the running release's CLI and Effect dependencies before importing the generated
  configuration. Reuse existing local installations without requiring a network call, and respect
  the invoking package manager when the project has no lockfile. Synchronize newly installed
  projects' package-manager lockfiles after applying the managed manifest, allowing frozen CI installs.

- [#102](https://github.com/projitect/projitect/pull/102) [`7d9be35`](https://github.com/projitect/projitect/commit/7d9be35451c53e6df4f41b514c8f2a1c0eced1f9) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Advance the lockstep release past the retired `@projitect/cli@1.0.0` version. That version was
  published in 2019 and unpublished in 2021; npm permanently reserves it, so the first current
  release cannot reuse it. The `pjt` command and package APIs are unchanged.
- Updated dependencies []:
  - @projitect/blueprint@1.0.1
  - @projitect/cli-internals@1.0.1
  - @projitect/core@1.0.1

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

- [#101](https://github.com/projitect/projitect/pull/101) [`03347e6`](https://github.com/projitect/projitect/commit/03347e66a0addacb86036519918082aca25b3442) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Publish the CLI as `@projitect/cli`, so every first-party package belongs to the `@projitect`
  organization. The executable remains `pjt`. Bootstrap with
  `pnpm --package=@projitect/cli dlx pjt init`; `.pjt.ts` imports `pjt` from `@projitect/cli`.
  Generated projects record `@projitect/cli` as their CLI devDependency. The previously planned
  unscoped `projitect` package has not been published.

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

- [#78](https://github.com/projitect/projitect/pull/78) [`36298e4`](https://github.com/projitect/projitect/commit/36298e4cdd489777909fe4860f6b70477acbe0f4) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New `@projitect/blueprint-next` package. `next()` scaffolds a Next.js (App Router) + TypeScript
  app: it composes the tsconfig, gitignore (`node`, `next` and `tsbuildinfo` sections) and vitest
  (jsdom) blueprints, owns `next.config.ts`, merges the `dev` / `build` / `start` / `lint` scripts and
  the Next.js, React, ESLint and testing dependencies into `package.json`, and seeds the starter
  source (`src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/page.test.tsx`)
  and an `eslint.config.mjs` that extends `eslint-config-next` once, never enforcing them afterwards.
  The supported Next.js and React ranges are declared in the package manifest under
  `projitect.supports`.

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

- [#79](https://github.com/projitect/projitect/pull/79) [`0133f4b`](https://github.com/projitect/projitect/commit/0133f4ba03dc8cf405f797663d26e7e749202a24) Thanks [@bigpopakap](https://github.com/bigpopakap)! - New `exec` helper in `@projitect/blueprint`. `exec({ id, version, check, fix })` declares a
  post-apply command: `pjt build` and `pjt remodel` run the fix command after every file operation
  has succeeded, and the blueprint declares an `exec` permission for the check and fix commands.
  `ExecOp` gains an optional `check` field.

  New public SDK helper → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#58](https://github.com/projitect/projitect/pull/58) [`5ec29b1`](https://github.com/projitect/projitect/commit/5ec29b12fc3227ad259dad091288a7874759be4d) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Add the `pjt.exec.command-failed` and `pjt.exec.command-not-permitted` error ids, a process runner,
  and enforcement of the `exec` permission (exact command-string match). Nothing is wired into
  `build`, `remodel` or `inspect` yet.

  New error ids → **minor** per the AGENTS.md "Versioning (lockstep)" table.

- [#83](https://github.com/projitect/projitect/pull/83) [`8d0c7b6`](https://github.com/projitect/projitect/commit/8d0c7b61e81e103e3496dd56bee91f3597b96a14) Thanks [@bigpopakap](https://github.com/bigpopakap)! - Add twelve `.gitignore` sections to `@projitect/blueprint-gitignore`: Vite, Astro, Nuxt, SvelteKit, Angular, Vue, Storybook, Yarn, pnpm, Vim, Sublime Text and Eclipse.

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

- [#78](https://github.com/projitect/projitect/pull/78) [`00b1f6d`](https://github.com/projitect/projitect/commit/00b1f6d2f7026bace859ffc9dc75076153c1484d) Thanks [@bigpopakap](https://github.com/bigpopakap)! - `tsconfig()` accepts `noEmit`, `allowJs`, `incremental`, `plugins` and `include` options, for
  projects whose framework does the emitting and wants its own `tsconfig.json` keys (for example
  Next.js). `noEmit: true` drops the emit settings; the other options add their field only when set.
  Default output is unchanged.

  New public options on a shipped blueprint → **minor** per the AGENTS.md "Versioning (lockstep)" table.

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

- [#84](https://github.com/projitect/projitect/pull/84) [`4f6e664`](https://github.com/projitect/projitect/commit/4f6e664d42ff04df299c4ed048e39d6a320a03e4) Thanks [@bigpopakap](https://github.com/bigpopakap)! - The platform file-system glob now honours `exclude` patterns on Node 22.12.

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
