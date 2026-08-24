# projitect

Project scaffolding that stays in sync. Like Terraform, for your frontend repo.

`projitect` keeps your `.gitignore`, `package.json`, configs, and folder structure aligned with
declarative **blueprints** — and tells you the moment they drift.

```bash
npx pjt init                  # bootstrap projitect in this project
pnpm pjt remodel              # apply the plan to disk (non-destructive)
pnpm pjt inspect              # report drift, exit 1 in CI when out of spec
```

## What's here

This is the monorepo. The website (`apps/website`) has the docs, the marketing pitch, and
the per-error code lookup pages. The published packages are:

| Package                          | What it does                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `projitect`                      | Main package. Ships the `pjt` binary and `projitect/cli` re-export.                                          |
| `@projitect/core`                | Shared contracts: `Blueprint`, `ChangeSet`, `Permission`, errors.                                            |
| `@projitect/blueprint`           | Authoring SDK. `regionFile`, `jsonMerge`, `ownFile`, `seedFile`, `directory`.                                |
| `@projitect/cli-internals`       | The engine — loader, planner, differ, applier, commands.                                                     |
| `@projitect/test-kit`            | In-memory `BlueprintFileSystem` for unit tests.                                                              |
| `@projitect/blueprint-gitignore` | Eight composable `.gitignore` sections (macOS, Windows, Linux, Node, Next, VS Code, JetBrains, tsbuildinfo). |

Plus `apps/website` (Astro Starlight; not published).

## Status

**v0**, built on the Effect v4 release candidate. Region-mode end-to-end. `init`, `remodel`, `inspect`, `explain`
work. `build --force` and `add` are scaffolded stubs (v0.1). Merge / owned / seed planning modes
are implemented but not yet exercised by a shipping blueprint.

The contributor guide lives in [AGENTS.md](./AGENTS.md). `CLAUDE.md` is a symlink to it.

## Develop

```bash
nvm use                  # Node 22.12+
pnpm install
pnpm check-all           # tc + lint + format:check + test + knip
pnpm build               # build all library packages
pnpm --filter website dev   # the docs site, http://localhost:4321
```

## License

MIT.
