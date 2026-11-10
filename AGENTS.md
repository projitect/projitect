# projitect — agent guide

`CLAUDE.md` is a symlink to this file. Source of truth.

This file is a short index: the repo overview, the basics every change needs, and a routing table
to the detailed guides. **Detailed rules live in guides under `docs/` or skills under
`.claude/skills/`; change this file only when agents need a new route to them.** When you update
it, rewrite the affected section cohesively — do not append patches to the bottom.

---

## What this repo is

`projitect` is a project-scaffolding tool — Terraform for frontend projects. The user-facing
binary is `pjt`. Project maintainers declare a list of **blueprints** in `.pjt.ts`; `pjt build`
materializes them, `pjt remodel` updates the project to match, and `pjt inspect` reports drift
with a nonzero exit for CI. The repository's canonical GitHub home is
**github.com/projitect/projitect** — repo links, every published package's `repository` field,
and the changesets changelog's `repo` option all use that slug.

This is a **pnpm monorepo**. `packages/*` and `apps/*` are the workspaces:

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
| `@projitect/blueprint-react`             | First-party blueprint: React + Vite + TypeScript app — composes tsconfig, gitignore and vitest.       |
| `@projitect/blueprint-next`              | First-party blueprint: Next.js App Router + TypeScript app — composes tsconfig, gitignore and vitest. |
| `@projitect/cli-internals`               | The engine — loader, planner, differ, applier, remover, commands, Node platform layer.                |
| `@projitect/cli`                         | Ships the `pjt` binary and `.pjt.ts` handling.                                                        |
| `@projitect/test-kit`                    | In-memory `BlueprintFileSystem` for unit tests.                                                       |
| `apps/website`                           | Astro Starlight marketing/docs site. Private, not published.                                          |

All published packages (everything above except `apps/website`) version in **lockstep** via
changesets — one shared version, matching Effect v4's own release model.

## Where to look

Pick the row that matches your task and open that document; each is one hop from here.

| If you are…                                                                                                 | Open                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Setting up a clone and getting to a green `pnpm check-all`                                                  | [Getting started](docs/getting-started.md)                                                                               |
| Learning the packages, the loader → planner → differ → applier pipeline, the soft sandbox                   | [Architecture](docs/architecture.md)                                                                                     |
| Writing or reviewing Effect code (Services, errors, `Match`, predicates, `dual`, `Result`)                  | [effect-conventions skill](.claude/skills/effect-conventions/SKILL.md)                                                   |
| Writing folds, merges, generic utilities or sorts (`Reducer`, `*X` utilities, `Order`)                      | [fp-utilities skill](.claude/skills/fp-utilities/SKILL.md)                                                               |
| Touching ESLint, Prettier, hooks, the Effect language service or CI                                         | [Tooling](docs/tooling.md)                                                                                               |
| Writing a blueprint, region markers, ownership modes, merge-mode `package.json` keys, or adding an error id | [Blueprint authoring](docs/blueprint-authoring.md#merge-mode-packagejson-keys)                                           |
| Scoping a first-party blueprint, or shipping Markdown snippets and agent skills                             | [First-party scope](docs/blueprint-authoring.md#first-party-blueprint-scope)                                             |
| Making a user-facing change (the website must change in the same PR)                                        | [Marketing site](docs/marketing-site.md)                                                                                 |
| Shipping a release, changesets, or dependency upgrades                                                      | [Publishing](docs/publishing.md), [verify without gh](docs/publishing.md#verifying-release-and-website-state-without-gh) |
| Setting up commit signing                                                                                   | [Signed commits](docs/agents-signing.md)                                                                                 |
| Changing AGENTS.md, docs or skills (where a new rule goes, the guidance check)                              | [Guidance maintenance](docs/guidance-maintenance.md), [docs index](docs/README.md)                                       |
| Using the Trello kanban workflow (optional)                                                                 | [Kanban overview](docs/kanban/overview.md), [daily workflows](docs/kanban/workflows.md)                                  |

## Contributor skills

Project skills under `.claude/skills/` cover the repeated chores. Prefer them over improvising.
Skill selection from the description is not guaranteed, so when a task matches a row, open the
linked `SKILL.md` directly:

| Skill                                                              | Use for                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [`create-commit`](.claude/skills/create-commit/SKILL.md)           | Staging and committing: one concept, conventional subject, changeset, no `--no-verify` |
| [`verify-commit`](.claude/skills/verify-commit/SKILL.md)           | Auditing commits against these rules, then `pnpm check-all`                            |
| [`push-pr`](.claude/skills/push-pr/SKILL.md)                       | Pushing the branch and opening a merge-commit PR with a conventional title             |
| [`rebase-main`](.claude/skills/rebase-main/SKILL.md)               | Rebasing onto `origin/main` without stash; `--force-with-lease` only                   |
| [`new-package`](.claude/skills/new-package/SKILL.md)               | Scaffolding a published workspace package under `packages/`                            |
| [`new-blueprint`](.claude/skills/new-blueprint/SKILL.md)           | Scaffolding `@projitect/blueprint-<name>` plus its marketing-site pages                |
| [`new-error-code`](.claude/skills/new-error-code/SKILL.md)         | Adding a `pjt.*` error end to end (class, registry, blurb, MDX page)                   |
| [`release-bump`](.claude/skills/release-bump/SKILL.md)             | Cutting a release (see [Publishing](docs/publishing.md))                               |
| [`effect-conventions`](.claude/skills/effect-conventions/SKILL.md) | Effect v4 conventions and patterns (see Where to look)                                 |
| [`fp-utilities`](.claude/skills/fp-utilities/SKILL.md)             | FP mindset, utility design and sort orders (see Where to look)                         |

## Package manager

**pnpm only.** Never npm, never yarn, never bun in this repo. The lockfile is `pnpm-lock.yaml`.

ampm agent sandboxes ship pnpm at the pinned `packageManager` version via `.ampm/Dockerfile`, so
there the ladder below normally stops at step 1. It stays the fallback for every other environment. How the image provisions pnpm: [.ampm/README.md](.ampm/README.md).

If `pnpm` is not found, escalate in this exact order — do not chain the steps:

1. Run the command as-is. If it works, stop.
2. Run `nvm use` (reads `.nvmrc`). Try again.
3. Run `source ~/.nvm/nvm.sh && nvm use`. Try again.
4. Use corepack (`packageManager` pins the pnpm version). For a single command, run
   `corepack pnpm <args>`. Root scripts that call `pnpm` again (`check-all`, `tc`, …) need a bare
   `pnpm` on PATH, so run `corepack pnpm install` first (it creates `node_modules`), then
   `corepack enable --install-directory node_modules/.bin`, then `corepack pnpm check-all`. Nested
   calls find the shim because pnpm puts `node_modules/.bin` on PATH for scripts — no `export PATH`
   needed, which matters because each Bash call is a fresh shell. If that directory is unusable,
   `mkdir -p <writable-dir>`, run `corepack enable --install-directory <writable-dir>`, and prefix
   each later command with `PATH=<writable-dir>:$PATH` (per command, never a separate `export`). The
   default `corepack enable` can fail writing `/usr/local/bin`, hence `--install-directory`.
   `corepack` is not on the allowlist, so expect a permission prompt.
5. Only if all of the above fail, ask the user.

Do **not** prepend `cd /path/to/repo` to pnpm commands — pnpm respects the current working
directory. Chaining `cd && pnpm` triggers permission prompts unnecessarily.

## Permission-prompt posture (command shape)

Most permission prompts are a **command-shape problem, not a missing allowlist entry** — the engine
auto-approves a command only when _every_ part of it is independently safe, so several wrappers defeat
an otherwise-allowlisted command. The allowlist in [`.claude/settings.json`](./.claude/settings.json)
covers the safe reads and routine scripts; you keep prompts low by _how_ you invoke things:

- **Prefer the built-in `Grep` / `Glob` / `Read` tools** over shell `grep` / `git grep` / `find` /
  `cat` / `sed` / `head` and pipelines. They don't go through the Bash permission path, so they never
  prompt — and they're faster. Concretely:
  - `sed -n 'A,Bp' file` / `head -n N file` → `Read` with `offset` / `limit`.
  - `grep … file` / `git grep …` → the `Grep` tool. Scope with `glob` (e.g. `**/*.ts`) and exclude
    tests with a negated glob (`!**/*.test.*`) instead of a `| grep -v` pipe.
  - **Reading or searching N files → one `Grep`/`Read`, never a `for f in …; do grep …; done` loop.**
  - Drop `echo "=== … ==="` section separators and `|| echo "no matches"` fallbacks entirely — the
    native tools label their output and report empty results for free. A stray `echo` is enough to
    force a prompt on an otherwise-allowlisted block.
- **One command per tool call — never `&&` / `;` / `|` / `$(…)` chains or `for`/`while` loops.** A
  compound line is auto-approved only if every segment independently clears, so even an all-allowlisted
  chain (`git add … && git commit … && git log …`) prompts. Run the steps as separate calls. Loops and
  command substitution prompt structurally — that gate is intentional, so reach for the native tools
  above instead of trying to allowlist your way around it.
- **Run project scripts verbatim** — `pnpm tc` / `pnpm test` / `pnpm lint` / `pnpm check-all`, with no
  env-var prefix (`TMPDIR=…`), no extra flags, and no `2>&1 | tail` / `2>/dev/null` capture wrapper. Run
  them bare and read the output; the redirect/pipe is itself what prompts.
- **Commit with `-m` (or `-F <file>`), never a heredoc.** `git commit <<'EOF' … EOF` is an input
  redirect and prompts on _every_ commit.
- **Don't `cd` / `git -C <path>` into the worktree you're already in** — an out-of-cwd path triggers a
  prompt. The cwd already _is_ the repo; run `git status`, `pnpm test`, etc. directly.

Consequential actions stay **deliberately gated** (they _should_ prompt): inline code runners
(`node -e`, `tsx -e`, `npx -e`), `gh pr merge`, `gh issue create`, publishes (`changeset publish`), and
destructive git (`git reset --hard`, `git clean -fd`, bare `git push --force`). To probe a library's
runtime behavior, write a throwaway test and run it with the allowlisted `pnpm test` instead of an inline
`-e` eval. Expanding the allowlist is the smallest lever, not the first — fix the root cause in scripts or
command shape before reaching for it. (This is the static-enforcement reflex from
[Reach for ESLint first](docs/tooling.md#reach-for-eslint-first) applied to the permission layer.)

## Node version

Pinned in `.nvmrc` to **22.12.0**. The published `engines.node` is `>=22.12.0`. We rely on Node
23.6+ for native TypeScript strip-types in user `.pjt.ts` files, with `tsx` as a fallback for
22.x users. Do not raise the floor without an open discussion.

## Verification ritual

Before claiming a task done, run **`pnpm check-all`** from the repo root. It runs, in order:

1. `pnpm tc` — `tsc --build` across all `src` and `test` project references. Type-level assertions
   in tests (`expectTypeOf`, `@ts-expect-error`) are enforced here, not by Vitest; see
   [Test files are typechecked](docs/tooling.md#test-files-are-typechecked)
2. `pnpm lint` — ESLint flat config (covers code style + Prettier formatting via `eslint-plugin-prettier`; no separate `format:check` step)
3. `pnpm test` — Vitest (unit + integration with the in-memory `BlueprintFileSystem`)
4. `pnpm knip` — unused exports
5. `pnpm check:guidance` — AGENTS.md size and symlink, links, docs index, skill frontmatter

Tests live in `packages/<pkg>/test/*.test.ts` and lean on `makeInMemoryLayer` from
`@projitect/test-kit`. Packages have no per-package `test` script, so to scope a run to one
package use `pnpm test packages/<pkg>` (Vitest filters by path); `pnpm --filter <pkg> tc` still
works for typechecking a single package. `check-all` is the gate before merging.

Three additional checks run in CI but are also runnable locally. All three require built
packages first — run `pnpm build` before any of them:

- `pnpm --filter website check:examples` — every code snippet under `apps/website/examples/`
  typechecks, and every `.yml` workflow example there is a workflow that runs `pjt inspect`.
  Marketing copy is not allowed to lie.
- `pnpm --filter website check:errors` — every error id exported by `@projitect/core` has a
  matching MDX page under `apps/website/src/content/docs/errors/`.
- `./scripts/check-packs.sh` — every packed tarball has `dist/` and a LICENSE equal to the root
  one, a shared version, `license` MIT and the projitect `repository`.
- `./scripts/smoke.sh` — end-to-end smoke in a throwaway `/tmp` project: exercises every CLI
  command (`init`, `remodel`, `inspect`, `explain`, `build --force`, `--completions`), validates
  lockfile-driven orphan removal, and validates the git safety nets (`init` refuses without git,
  `build` refuses on a dirty tree), and runs the published-package journey against a local registry
  serving packed tarballs: `add` (with and without `--section`, no terminal), `remodel`, upgrade, swap,
  remove, `inspect --json` drift, a skills package, and a package without `projitect` metadata. Heaviest gate; run when you've touched the CLI pipeline.

## Tooling and CI

Lint rules, Prettier, the Effect language service, the husky + lint-staged pre-commit hook and the
CI jobs are in [Tooling](docs/tooling.md). Two rules matter for every change: ESLint absorbs
Prettier (`pnpm lint` is the single command; `pnpm lint:fix` autofixes), and when you introduce a
new dep or architectural rule you first check whether a lint rule can enforce it.

## Commits and PRs

- Conventional Commits by convention — there is no commitlint config or `commit-msg` hook;
  `.husky/pre-commit` only runs `pnpm lint-staged` (ESLint + Prettier on staged files). Write
  conventional subjects anyway, because...
- PR merge style: merge commit (never squash) — the PR title becomes the merge commit subject, so
  PR titles are conventional too (e.g. `fix(deps): update dependency sharp (#35)`).
- One concept per commit; squash trivial fixups locally before opening a PR
- Run `pnpm check-all` before pushing
- The `create-commit`, `verify-commit`, `push-pr` and `rebase-main` skills encode this section
- A PR that changes a published package (see the package table under
  [What this repo is](#what-this-repo-is)) adds a hand-written `.changeset/<kebab-name>.md` —
  frontmatter `"@projitect/cli": <bump>`; the `fixed` group in `.changeset/config.json` bumps every
  published package together regardless of which one the entry names. `pnpm changeset` walks
  you through it interactively; the existing files in `.changeset/` are worked examples.
- When a card from the kanban workflow shipped: include `[kanban #<CARD_ID>]` in the commit
  subject (e.g. `feat(cli): add --json to pjt inspect [kanban #42]`). The orchestrator
  prompts you for this on the final approval gate — see
  [Kanban workflow](docs/kanban/overview.md).

### Commit signing

Every commit is signed with a dedicated "Claude Code" SSH key; git does it for you because
`commit.gpgsign=true` is configured, and the `SessionStart` hook re-applies the config each
session. You never decide whether to sign. Setup and details: [Signed commits](docs/agents-signing.md).

## No destructive shortcuts

When a check fails, fix the root cause. **Do not**:

- Add `as any` or `// @ts-ignore` to silence type errors
- Skip tests or mark them `.skip` to make CI green
- Commit with `--no-verify` to bypass hooks
- `pnpm install --ignore-scripts` to dodge a postinstall failure
- Delete a test that "doesn't apply anymore" without writing what replaces it

If you can't fix the underlying issue in this PR, leave it failing and flag it.

## Marketing site

The Astro Starlight site under `apps/website` is written in present tense, as if the latest version
is the only one that ever existed, and **the PR that lands a code change also lands its docs** — no
docs follow-up PRs. A plan that introduces a user-facing change lists the marketing pages it will
touch. The triggers, per-phase gates and CI checks are in [Marketing site](docs/marketing-site.md).

## Browser demo boundary

A planned in-browser `pjt` demo on the website runs on an in-memory filesystem and bundled
first-party blueprints only: no Node capabilities, no `node:*` in the browser bundle, and no
isolation for untrusted `.pjt.ts` snippets without extra work. `apps/website` stays Astro Starlight.
The bundle-size budget is set from the measured demo bundle in the demo PR. Rules, guard and
locations: [Browser demo boundary](docs/architecture.md#browser-demo-boundary-planned).

## Kanban workflow

Day-to-day work can flow through an optional Trello board with `/kanban-*` skills and a human
approval gate at every transition. If Trello isn't configured, skip the `/kanban-*` skills and the
`[kanban #…]` commit suffix entirely. Board layout, skills and setup:
[Kanban overview](docs/kanban/overview.md).

## Versioning (lockstep)

All published packages (`@projitect/*`, including `@projitect/cli`) share one version, bumped
together via changesets. Pick the bump type per this table — cite the rule when running `pnpm changeset`:

| Change                                                                                                                                                                                                   | Bump      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Breaking change in any public API (Blueprint shape, ChangeSet shape, Permission shape, CLI flag rename/removal, error id rename/removal, lockfile schema bump, `pjt inspect --json` schema version bump) | **major** |
| New public feature (new ownership mode, new CLI command, new error class with new id, new SDK helper, new blueprint package)                                                                             | **minor** |
| Bug fix, doc-only change, internal refactor, dep bump that doesn't change consumer-visible behavior                                                                                                      | **patch** |

When in doubt about bump severity, pick the higher one. Cost of an unnecessary major is low (no
consumer breakage); cost of an unannounced major is high.

## Releases and dependency upgrades

Releases go through changesets and a gated GitHub workflow — agents only add the changeset file and
never publish. Renovate opens dependency-upgrade PRs. Details: [Publishing](docs/publishing.md).

## CLAUDE.md ↔ AGENTS.md

`CLAUDE.md` is a symbolic link to this file. If you find yourself editing both, you've broken
the symlink — restore it with `ln -sf AGENTS.md CLAUDE.md` from the repo root.
