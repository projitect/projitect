# Publishing

How changes reach npm. The index is [AGENTS.md](../AGENTS.md); see also [getting started](./getting-started.md) and [architecture](./architecture.md).

## Changesets

A PR that changes a published package adds a hand-written `.changeset/<kebab-name>.md`; `pnpm changeset` walks you through it. Pick the bump with the table in [Versioning (lockstep)](../AGENTS.md#versioning-lockstep). Docs-only and website-only PRs need none.

## Lockstep versioning

`.changeset/config.json` sets `fixed: [["projitect", "@projitect/*"]]`, so every published package shares one version whichever package an entry names. `apps/website` is private and listed under `ignore`.

## Shipping a release

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on every push to `main`:

1. `changesets/action` looks for `.changeset/*.md` files and opens or updates a `chore(release): version packages` PR that applies them with `pnpm version-packages`.
2. Merging that PR runs the workflow again, which runs `pnpm release` (`pnpm build`, then `changeset publish`), publishing every package in the `fixed` group with npm provenance (`NPM_CONFIG_PROVENANCE=true`).

Only the release job runs on Node 24 with `npm@^11.5.1`, because npm trusted publishing needs npm >= 11.5.1 and Node >= 22.14.0. `.nvmrc` and `engines.node` (`>=22.12.0`) are unchanged. The job keeps `id-token: write` for OIDC and provenance; no npm token is wired in, and none belongs in source or the workflow.

Agents never publish directly: there is no interactive `changeset publish` step to run by hand, only the changeset file that feeds the gated workflow above. The `release-bump` skill in `.claude/skills/release-bump/` walks through cutting a release.

### Release job permissions

The release job holds exactly these `GITHUB_TOKEN` permissions:

- `contents: write` — push the version PR branch and the release tags.
- `pull-requests: write` — open or update the version PR and comment on released PRs.
- `issues: write` — comment on the issues the released PRs close.
- `id-token: write` — OIDC for npm trusted publishing and provenance.

Release automation that posts comments may use `issues: write` only in the release job, only after a successful publish (`published == 'true'`), and only with the built-in `GITHUB_TOKEN`. Such a step is best-effort (`continue-on-error: true`), so a comment failure never fails the publish. No new token or credential is allowed.

### How a release maps to GitHub

After a successful publish, [`scripts/comment-released.ts`](../scripts/comment-released.ts) comments "Shipped in projitect vX.Y.Z". The commits since the previous `projitect@*` tag give the PRs in the release; the issues those PRs close (`Fixes #…` or `Closes #…` in the PR) are included. A hidden `<!-- pjt-release:vX.Y.Z -->` marker makes re-runs skip anything already commented.

GitHub issues are a supported work channel alongside the optional Trello board. The `[kanban #…]` commit suffix is not required for work tracked as a GitHub issue; see the [Kanban overview](./kanban/overview.md) for the board.

### Local release-notes preview

Preview the changelog a version PR would produce without publishing anything. `@changesets/changelog-github` calls the GitHub API, so the maintainer supplies a personal `GITHUB_TOKEN`; agents are not given one. Run it only in a disposable worktree, never in your own checkout, so uncommitted work cannot be discarded:

1. `git worktree add --detach <tmp> HEAD`, then `pnpm install` inside `<tmp>`.
2. In `<tmp>`, run `pnpm version-packages` (`changeset version`, the command the version PR runs) and read the diff.
3. Discard only what that run generated. List it with `git status --porcelain`, then run `git restore --source=HEAD --staged --worktree -- <those paths>`. Tracked paths (` M`/` D`) are the consumed `.changeset/*.md` files, the `version` fields in `package.json` files, existing `CHANGELOG.md` files, and `pnpm-lock.yaml` if touched; restore them with that command. A `CHANGELOG.md` that did not exist yet shows as untracked (`??`), which `git restore` cannot touch: delete each by name with `rm`. Name files explicitly; never restore a whole directory such as `packages`, and never `.`.
4. `git worktree remove --force <tmp>`.

Do not use `git stash`, `git reset --hard` or `git clean -fd` as shortcuts: the stash stack is shared across worktrees, and the other two destroy unrelated work.

To preview the release comments, run `pnpm release:comment --dry-run` (needs `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PUBLISHED_PACKAGES`).

### Snapshot publishes

No snapshot-publish workflow exists today, and adding one is an owner decision; the feature is tracked as it-0379ce2e, which also owns snapshot security and account activation. Until the owner decides, these are constraints, not enabled behaviour (each is pending the owner's decision):

- Fork PRs get no secrets and cannot publish.
- `pull_request_target` is not used to run PR code.
- Only maintainers with write access may apply a trigger label.
- Snapshots, if added, must be published with npm provenance.

## License

The MIT copyright holder is Kapil Easwar (owner-confirmed): `LICENSE` reads "Copyright (c) 2026 Kapil Easwar" at the root and in every package, and `check-packs.sh` fails if a package copy differs.

## Authentication

Trusted publishing (OIDC from GitHub Actions) is preferred. No authentication choice has been made yet, and no owner credential or registry state is confirmed.

## Owner-only setup checklist

Only the npm owner can do these. They are the **blocker for the first release**.

- [ ] Make every published package eligible on npm: `projitect` and each `@projitect/*` package under `packages/` (list them with `ls packages`, currently including `@projitect/blueprint-markdown`).
- [ ] For each package, register a GitHub Actions trusted publisher: owner `projitect`, repository `projitect`, workflow `release.yml`.
- [ ] Confirm the `@projitect` scope is owned by the publishing account.

No local, bootstrap or placeholder publish is allowed to satisfy this list.

## Preflight

Before the owner merges the first release PR:

1. The checklist above is complete for every published package.
2. `pnpm build` then `./scripts/check-packs.sh` pass (every tarball has `dist/` and a LICENSE matching the root one, one shared version, correct `repository`). CI runs this in `publish-dry-run`.
3. On the first release, watch the release job: `npm --version` must log >= 11.5.1, and the publish step must not fail with an auth error (E401/E403/E404).

## Release confirmation

A green version-PR job is not confirmation. The release is confirmed only when the public registry returns the released version for both `pnpm view projitect version` and `pnpm view @projitect/core version`.

## Dependency upgrades (Renovate)

Renovate runs on this repo and opens PRs for dep upgrades. Configured at [renovate.json5](../renovate.json5). Two things to know:

- Most packages are published libraries, so the default `rangeStrategy` is `update` (caret/tilde ranges preserved — consumers dedupe). The workspace root `package.json` and `apps/website/package.json` are private, so they pin exact versions via `matchFileNames` overrides.
- Non-major bumps, devDep majors, and lockfile maintenance auto-merge. Runtime-dep majors (Effect v3 → v4, etc.) wait for human approval. PRs queue for `minimumReleaseAge` (3-8 days depending on dep type) to dodge the npm 72-hour unpublish window.

When adding a new published `@projitect/*` package: nothing to do — it inherits the default js-lib semantics. When adding a new `apps/*` private package: extend the `matchFileNames` rule to include it.
