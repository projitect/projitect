# Architecture

A map of the monorepo. [AGENTS.md](../AGENTS.md) holds the rules; see also [getting started](./getting-started.md) and [publishing](./publishing.md).

## Packages

| Package                           | Role                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@projitect/core`                 | Shared contracts — `Blueprint`, `ChangeSet`, `Permission`, errors. Runtime-pure, no `node:*`.         |
| `@projitect/blueprint`            | Authoring SDK — `regionFile`, `jsonMerge`, `ownFile`, `seedFile`, `directory`, `BlueprintFileSystem`. |
| `@projitect/blueprint-gitignore`  | First-party blueprint: composable `.gitignore` sections.                                              |
| `@projitect/blueprint-tsconfig`   | First-party blueprint: managed `tsconfig.json`.                                                       |
| `@projitect/blueprint-vitest`     | First-party blueprint: managed Vitest config.                                                         |
| `@projitect/blueprint-changesets` | First-party blueprint: managed Changesets config, scripts and devDependency.                          |
| `@projitect/blueprint-react`      | First-party blueprint: React + Vite + TypeScript app, composing tsconfig, gitignore and vitest.       |
| `@projitect/cli-internals`        | The engine — loader, planner, differ, applier, remover, commands, Node platform layer, `runAddCli`.   |
| `projitect`                       | Ships the `pjt` binary and `.pjt.ts` handling.                                                        |
| `@projitect/test-kit`             | In-memory `BlueprintFileSystem` for unit tests.                                                       |
| `apps/website`                    | Astro Starlight marketing/docs site. Private, not published.                                          |

## Pipeline

`pjt build` and `pjt remodel` turn a project's `.pjt.ts` into file changes. The stages live in `packages/cli-internals/src`:

1. **Loader** (`worker/`) runs `.pjt.ts` and each blueprint's plan in a permission-restricted child process and returns every blueprint's id, version, permissions and `ChangeSet`.
2. **Planner** (`plan.ts`) reduces those `ChangeSet`s into one plan; two owners of one region is a `pjt.plan.conflict`.
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

Details: [File ownership modes](../AGENTS.md#file-ownership-modes) and [Region marker convention](../AGENTS.md#region-marker-convention).

## Sandbox

Blueprint code runs in a child Node process started with Node's permission model: it can read only an allowlist the parent computes (its own code, the `.pjt.ts`, the dependency closure and the Node installation) and has no child-process or worker permission. This prevents accidents; it does not contain malicious code. Blueprints never touch the project directly. They use `BlueprintFileSystem`, whose calls travel to the parent over IPC and which `cli-internals` gates by the `Permission`s each blueprint declares. ESLint backs this up with import bans: blueprint packages cannot import `@effect/platform`'s `FileSystem` or any `node:*`; `core` and `test-kit` cannot import `node:*`. Node-backed `pjt add` code lives in `cli-internals`, not in blueprint packages; see [Where the `pjt add` CLI code lives](../AGENTS.md#where-the-pjt-add-cli-code-lives). See [Blueprint authoring rules](../AGENTS.md#blueprint-authoring-rules) and [ESLint absorbs Prettier](../AGENTS.md#eslint-absorbs-prettier).
