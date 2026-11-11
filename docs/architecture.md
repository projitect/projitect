# Architecture

A map of the monorepo. [AGENTS.md](../AGENTS.md) is the index; see also [getting started](./getting-started.md) and [publishing](./publishing.md).

## Packages

| Package                                  | Role                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@projitect/core`                        | Shared contracts — `Blueprint`, `ChangeSet`, `Permission`, errors. Runtime-pure, no `node:*`.         |
| `@projitect/blueprint`                   | Authoring SDK — `regionFile`, `jsonMerge`, `ownFile`, `seedFile`, `directory`, `BlueprintFileSystem`. |
| `@projitect/blueprint-gitignore`         | First-party blueprint: composable `.gitignore` sections.                                              |
| `@projitect/blueprint-tsconfig`          | First-party blueprint: managed `tsconfig.json`.                                                       |
| `@projitect/blueprint-vitest`            | First-party blueprint: managed Vitest config.                                                         |
| `@projitect/blueprint-changesets`        | First-party blueprint: managed Changesets config, scripts and devDependency.                          |
| `@projitect/blueprint-husky-lint-staged` | First-party blueprint: managed husky pre-commit hook, lint-staged config and devDependencies.         |
| `@projitect/blueprint-markdown`          | First-party blueprint: composable `AGENTS.md` / `README.md` snippets.                                 |
| `@projitect/blueprint-skills`            | First-party blueprint: versioned agent skills installed into a skills directory.                      |
| `@projitect/blueprint-react`             | First-party blueprint: React + Vite + TypeScript app, composing tsconfig, gitignore and vitest.       |
| `@projitect/blueprint-next`              | First-party blueprint: Next.js App Router + TypeScript app, composing tsconfig, gitignore and vitest. |
| `@projitect/cli-internals`               | The engine — loader, planner, differ, applier, remover, commands, Node platform layer, `runAddCli`.   |
| `@projitect/cli`                         | Ships the `pjt` binary and `.pjt.ts` handling.                                                        |
| `@projitect/test-kit`                    | In-memory `BlueprintFileSystem` for unit tests.                                                       |
| `apps/website`                           | Astro Starlight marketing/docs site. Private, not published.                                          |

## Pipeline

`pjt build` and `pjt remodel` turn a project's `.pjt.ts` into file changes. The stages live in `packages/cli-internals/src`:

1. **Loader** (`loader.ts`) reads `.pjt.ts` and yields the declared blueprints.
2. **Planner** (`plan.ts`) asks each blueprint for its `ChangeSet`; two owners of one region is a `pjt.plan.conflict`.
3. **Differ** (`differ.ts`) compares the plan with the files on disk. `pjt inspect` reports this drift.
4. **Applier** (`applier.ts`) writes the changes.
5. **Post-apply phase** (`post-apply.ts`) runs the `Exec` commands the planner split out of the file plan. It runs after every file operation succeeds, checks each command against its blueprint's `exec` permission before starting any, and `pjt inspect` refuses a project that has them. Commands run through `nodeSpawner` (`platform/process-runner.ts`) with no shell of ours (`cross-spawn`, `shell: false`, literal argv; on Windows cross-spawn may itself route a target through `cmd.exe`, so the runner refuses any program, argument or resolved path containing `%`, a line break or NUL, whatever the file extension, instead of altering it). A bare program resolves via `which` from `<projectRoot>/node_modules/.bin` (that directory only, no ancestors), then the caller's `PATH` (relative and empty entries resolved against the project root, as the child resolves them); a program containing a path separator runs as given, relative to the project root. The child gets a per-call env copy with the local bin directory prepended to PATH; `process.env` is never mutated. A tool found nowhere fails `pjt.exec.command-failed`, naming it and the searched directories. Tested on Linux (Node 22.12 and 24 in CI) and, for real `.cmd` shims, on `windows-latest` (the `windows runner` job on GitHub Actions `windows-latest`, Node 22.12.0 and 24); macOS relies on the libraries.

Alongside, `lockfile.ts` records what was applied and `remover.ts` removes orphans the lockfile no longer claims.

### Browser entry

`@projitect/cli-internals/browser` re-exports the planner, differ, applier, remover and lockfile functions plus the `.pjt.ts` evaluator, and nothing that reaches `node:*` (commands, git, package manager, platform layers and the loader stay out). The planner takes its per-blueprint filesystem layer as `layerFor`: the CLI passes `makeRealLayer`, a browser passes `makeGatedLayer` over an in-memory layer such as `@projitect/test-kit`'s. `test/browser-bundle.test.ts` bundles both browser entries and test-kit for the browser and fails if any `node:*` module enters the graph.

A browser has no native TypeScript stripping or `tsx`, so `evaluatePjt` transpiles the `.pjt.ts` text with `sucrase` and runs it against a registry of importable modules; `@projitect/cli-internals/browser-blueprints` ships one holding the first-party blueprint packages. Failures (syntax error, unknown import, throwing top level, wrong default export) come back as a typed `PjtEvalFailure` and never throw. The restricted blueprint-list alternative was rejected because it needs its own parser and breaks pasting a real `.pjt.ts`.

`evaluatePjt` executes the text as JavaScript and is not a security sandbox; see [Browser demo boundary](#browser-demo-boundary-planned) for what hosts must do with untrusted snippets.

Core configuration uses `/` as its portable default project root. The Node CLI dispatch already supplies its current working directory as a command-line override, preserving command behavior. Programmatic core consumers that need a host-specific root pass it explicitly to `ProjitectConfig.resolve`; core never reads Node globals during import.

## Ownership modes

| Mode     | Meaning                                                         |
| -------- | --------------------------------------------------------------- |
| `region` | Text file shared by several blueprints, each in a fenced region |
| `merge`  | Structured JSON; the blueprint owns specific keys               |
| `owned`  | Generated file owned wholly by one blueprint                    |
| `seed`   | Write-once, never enforced afterwards                           |

Details: [File ownership modes](./blueprint-authoring.md#file-ownership-modes) and [Region marker convention](./blueprint-authoring.md#region-marker-convention).

## Soft sandbox

Blueprints never touch the disk directly. They use `BlueprintFileSystem`, which `cli-internals` gates by the `Permission`s each blueprint declares. ESLint backs this up with import bans: blueprint packages cannot import `@effect/platform`'s `FileSystem` or any `node:*`; `core` and `test-kit` cannot import `node:*`. Node-backed `pjt add` code lives in `cli-internals`, not in blueprint packages; see [Where the `pjt add` CLI code lives](./blueprint-authoring.md#where-the-pjt-add-cli-code-lives). See [Blueprint authoring rules](./blueprint-authoring.md#blueprint-authoring-rules) and [ESLint absorbs Prettier](./tooling.md#eslint-absorbs-prettier).

## Browser demo boundary (planned)

The marketing site plans an interactive in-browser `pjt` demo. This section is the boundary a plan for it is judged against. The browser-safe engine entry, `@projitect/cli-internals/browser`, and its first-party registry, `@projitect/cli-internals/browser-blueprints`, are in place.

- **Runtime model.** An in-memory filesystem and bundled first-party blueprints only. No Node capabilities, no real filesystem, and no undeclared remote packages.
- **May be bundled.** `core`, `blueprint`, `test-kit`, the first-party `blueprint-*` packages, and the browser entry of `cli-internals`. That entry exposes plan, diff, apply, removal and lockfile logic, the gated layer and the `.pjt.ts` evaluator. In-memory operations may plan, diff, apply and remove; writing through the in-memory filesystem is allowed.
- **Must stay out.** The `cli-internals` commands, loader, git, package-manager, edit-pjt, filesystem-impl and `platform/*` layers, and any `node:*` import.
- **Guard.** ESLint `no-restricted-imports` bans `node:*` in `core`, `blueprint*`, `test-kit` and the browser-graph `cli-internals` modules (see [Tooling](./tooling.md#eslint-absorbs-prettier)). `packages/cli-internals/test/browser-bundle.test.ts` bundles the browser entry, the blueprint registry and `test-kit` for the browser with esbuild and fails if any `node:*` module is reachable.
- **Untrusted snippets.** `evaluatePjt` runs the `.pjt.ts` text as JavaScript in the calling realm (`new Function`); the registry only limits what `import` resolves. The initial demo accepts bundled examples and code a user chooses to run in their own tab. Running shared or untrusted snippets requires a separate host isolation design with restricted browser capabilities, network access and a validated messaging interface. Moving evaluation into a Worker alone does not provide that boundary: Workers still have network and storage APIs ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)). The demo PR must verify the actual isolation and network policy before enabling untrusted execution.
- **Website tooling.** `apps/website` stays Astro Starlight. No separate Vite app is added; bundler configuration goes through Astro's own Vite integration.
- **Where it lives.** The demo source is a component under `apps/website`. Its worked example lives under `apps/website/examples/` and is covered by `pnpm --filter website check:examples`. The demo's marketing pages ship in the same PR as the demo ([Marketing site](./marketing-site.md)).
- **Bundle size.** No numeric budget is set yet. The budget is proposed from the measured size of the real demo bundle and added in the demo PR; that measurement owns the number.
