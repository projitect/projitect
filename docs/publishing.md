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

When the publish succeeds (`published == 'true'`), a follow-up step runs [`scripts/comment-released.ts`](../scripts/comment-released.ts): it comments "Shipped in projitect vX.Y.Z" on each PR in the release (the commits since the previous `projitect@*` tag) and on the issues those PRs close. A hidden `<!-- pjt-release:vX.Y.Z -->` marker makes re-runs skip anything already commented, and a failed comment is logged without failing the job. Preview with `pnpm release:comment --dry-run` (needs `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PUBLISHED_PACKAGES`).

Agents never publish directly: there is no interactive `changeset publish` step to run by hand, only the changeset file that feeds the gated workflow above. The `release-bump` skill in `.claude/skills/release-bump/` walks through cutting a release.

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
