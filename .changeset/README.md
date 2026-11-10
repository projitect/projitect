# Changesets

This monorepo uses [changesets](https://github.com/changesets/changesets) for versioning and releases.

All public packages (`@projitect/*`) are in a **fixed** group — they bump
together to a single shared version. This matches Effect v4's own release model. The marketing
site under `apps/website` is in the `ignore` list and never versioned.

## Adding a changeset

```bash
pnpm changeset
```

Pick the packages that changed, pick a bump type (patch / minor / major), write a short
human-readable summary. The CLI writes a Markdown file to this directory. Commit it.

## Releasing

CI runs `changesets/action` on merges to `main`. It either opens a "Version Packages" PR (when
unreleased changesets exist) or publishes to npm when that PR is merged. Authentication follows
[Publishing](../docs/publishing.md): an owner-approved scoped token for the first real release,
then per-package OIDC and removal of the temporary token.

After a successful publish, `scripts/comment-released.ts` comments "Shipped in projitect vX.Y.Z"
on each PR in the release and on the issues those PRs close. Each comment carries a hidden
`<!-- pjt-release:vX.Y.Z -->` marker, so re-running skips anything already commented. It is
best-effort and never fails the publish. Preview locally with
`GITHUB_TOKEN=… GITHUB_REPOSITORY=projitect/projitect PUBLISHED_PACKAGES='[{"name":"@projitect/cli","version":"X.Y.Z"}]' pnpm release:comment --dry-run`.
