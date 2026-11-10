# projitect

Project scaffolding that stays in sync. Like Terraform, for your frontend repo.

`projitect` keeps your `.gitignore`, `package.json`, configs, and folder structure aligned with
declarative **blueprints** — and tells you the moment they drift.

```bash
pnpm --package=@projitect/cli dlx pjt init                  # bootstrap projitect in this project
pnpm pjt remodel              # apply the plan to disk (non-destructive)
pnpm pjt inspect              # report drift, exit 1 in CI when out of spec
```

## What's here

This is the monorepo. The website (`apps/website`) has the docs, the marketing pitch, and
the per-error code lookup pages. The published packages are:

| Package                                  | What it does                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@projitect/cli`                         | CLI package. Ships the `pjt` binary and the `pjt` configuration helper.                                                                                                                                      |
| `@projitect/core`                        | Shared contracts: `Blueprint`, `ChangeSet`, `Permission`, errors.                                                                                                                                            |
| `@projitect/blueprint`                   | Authoring SDK. `regionFile`, `jsonMerge`, `ownFile`, `seedFile`, `directory`.                                                                                                                                |
| `@projitect/cli-internals`               | The engine — loader, planner, differ, applier, commands.                                                                                                                                                     |
| `@projitect/test-kit`                    | In-memory `BlueprintFileSystem` for unit tests.                                                                                                                                                              |
| `@projitect/blueprint-gitignore`         | Twenty composable `.gitignore` sections (macOS, Windows, Linux, Node, Next, VS Code, JetBrains, tsbuildinfo, Vite, Astro, Nuxt, SvelteKit, Angular, Vue, Storybook, Yarn, pnpm, Vim, Sublime Text, Eclipse). |
| `@projitect/blueprint-tsconfig`          | Managed `tsconfig.json` blueprint.                                                                                                                                                                           |
| `@projitect/blueprint-vitest`            | Managed Vitest config blueprint.                                                                                                                                                                             |
| `@projitect/blueprint-changesets`        | Managed Changesets release tooling blueprint.                                                                                                                                                                |
| `@projitect/blueprint-husky-lint-staged` | Managed husky pre-commit hook and lint-staged config blueprint.                                                                                                                                              |
| `@projitect/blueprint-markdown`          | Composable `AGENTS.md` / `README.md` snippets with stable owner ids.                                                                                                                                         |
| `@projitect/blueprint-react`             | React + Vite + TypeScript app blueprint; composes tsconfig, gitignore and vitest.                                                                                                                            |
| `@projitect/blueprint-next`              | Next.js App Router + TypeScript app blueprint; composes tsconfig, gitignore and vitest.                                                                                                                      |
| `@projitect/blueprint-skills`            | Versioned agent skills blueprint.                                                                                                                                                                            |

Plus `apps/website` (Astro Starlight; not published).

## Status

The first public release is in preparation, built on the Effect v4 release candidate. `init`,
`add`, `build`, `remodel`, `inspect` and `explain` are implemented. The smoke journey exercises
Markdown snippets, skills, upgrade/swap/removal, drift detection, and React/Next scaffolding.
Every published package belongs to the `@projitect` scope; the executable is `pjt`.

The contributor guide lives in [AGENTS.md](./AGENTS.md). `CLAUDE.md` is a symlink to it.

## Develop

```bash
nvm use                  # Node 22.12+
pnpm install
pnpm check-all           # tc + lint (includes Prettier formatting) + test + knip
pnpm build               # build all library packages
pnpm --filter website dev   # the docs site, http://localhost:4321
```

## License

MIT — see [LICENSE](./LICENSE).
