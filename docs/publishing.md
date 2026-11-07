# Publishing

How changes reach npm. The rules live in [AGENTS.md](../AGENTS.md); see also [getting started](./getting-started.md) and [architecture](./architecture.md).

## Changesets

A PR that changes a published package adds a hand-written `.changeset/<kebab-name>.md`; `pnpm changeset` walks you through it. Pick the bump with the table in [Versioning (lockstep)](../AGENTS.md#versioning-lockstep). Docs-only and website-only PRs need none.

## Lockstep versioning

`.changeset/config.json` sets `fixed: [["projitect", "@projitect/*"]]`, so every published package shares one version whichever package an entry names. `apps/website` is private and listed under `ignore`.

## Release workflow

`.github/workflows/release.yml` runs on every push to `main`:

1. `changesets/action` opens or updates a `chore(release): version packages` PR that applies pending changesets with `pnpm version-packages`.
2. Merging that PR runs the workflow again, which runs `pnpm release` (`pnpm build`, then `changeset publish`) with npm provenance.

Only the release job runs on Node 24 with `npm@^11.5.1`, because npm trusted publishing needs npm >= 11.5.1 and Node >= 22.14.0. `.nvmrc` and `engines.node` (`>=22.12.0`) are unchanged. The job keeps `id-token: write` for OIDC and provenance; no npm token is wired in, and none belongs in source or the workflow.

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

## Agents never publish

Agents only add the changeset file; the workflow publishes. The `release-bump` skill in `.claude/skills/release-bump/` walks through cutting a release. See [Shipping a release](../AGENTS.md#shipping-a-release).
