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
5. **Post-apply phase** (`post-apply.ts`) runs the `Exec` commands the planner split out of the file plan. It runs after every file operation succeeds, checks each command against its blueprint's `exec` permission before starting any, and `pjt inspect` refuses a project that has them.

Alongside, `lockfile.ts` records what was applied and `remover.ts` removes orphans the lockfile no longer claims.

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

The marketing site plans an interactive in-browser `pjt` demo. This section is the boundary a plan for it is judged against. The browser-safe engine entry, `@projitect/cli-internals/browser`, and its first-party registry, `@projitect/cli-internals/browser-blueprints`, are in review in PR #81 and not yet on `main`; confirm the names below against `main` before relying on them.

- **Runtime model.** An in-memory filesystem and bundled first-party blueprints only. No Node capabilities, no real filesystem, and no undeclared remote packages.
- **May be bundled.** `core`, `blueprint`, `test-kit`, the first-party `blueprint-*` packages, and the browser entry of `cli-internals`. That entry exposes plan, diff, apply, removal and lockfile logic, the gated layer and the `.pjt.ts` evaluator. In-memory operations may plan, diff, apply and remove; writing through the in-memory filesystem is allowed.
- **Must stay out.** The `cli-internals` commands, loader, git, package-manager, edit-pjt, filesystem-impl and `platform/*` layers, and any `node:*` import.
- **Guard.** ESLint `no-restricted-imports` bans `node:*` in `core`, `blueprint*`, `test-kit` and the browser-graph `cli-internals` modules (see [Tooling](./tooling.md#eslint-absorbs-prettier)). `packages/cli-internals/test/browser-bundle.test.ts` bundles the browser entry, the blueprint registry and `test-kit` for the browser with esbuild and fails if any `node:*` module is reachable. Both land with PR #81.
- **Not isolation.** `evaluatePjt` runs the `.pjt.ts` text as JavaScript in the calling realm (`new Function`); the registry only limits what `import` resolves. Text the user wrote in their own tab is fine, but shared or untrusted snippets need isolation by the demo host, such as a sandboxed iframe or a Worker.
- **Website tooling.** `apps/website` stays Astro Starlight. No separate Vite app is added; bundler configuration goes through Astro's own Vite integration.
- **Where it lives.** The demo source is a component under `apps/website`. Its worked example lives under `apps/website/examples/` and is covered by `pnpm --filter website check:examples`. The demo's marketing pages ship in the same PR as the demo ([Marketing site](./marketing-site.md)).
- **Bundle size.** No numeric budget is set yet. The budget is proposed from the measured size of the real demo bundle and added in the demo PR; that measurement owns the number.
