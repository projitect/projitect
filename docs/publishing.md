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

## Agents never publish

Agents only add the changeset file; the workflow publishes. The `release-bump` skill in `.claude/skills/release-bump/` walks through cutting a release. See [Shipping a release](../AGENTS.md#shipping-a-release).
