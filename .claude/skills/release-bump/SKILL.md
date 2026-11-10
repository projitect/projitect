---
name: release-bump
description: Cut a projitect release. Reads the diff since the last release, suggests a changeset bump per the rules in AGENTS.md, drafts the changeset summary, verifies CI gates and marketing-site freshness, then walks through `pnpm changeset` / merge / publish. Use when you're ready to ship a version.
---

# release-bump

This skill walks the user through cutting a projitect release. It assumes all code + docs
changes for the release have already been committed; the marketing site is already in sync (per
the **continuous obligation** in [Marketing site](../../../docs/marketing-site.md)).

## When to invoke

Use when the user says one of:

- "Cut a release"
- "Release v0.X.Y"
- "Ship it"
- "Time to publish"

Skip when:

- There are uncommitted changes (`git status` not clean). Ask the user to commit first.
- There are no changesets pending AND no diff since the last tag. There's nothing to release.

## Steps

### 1. Verify the baseline

Run in parallel:

```bash
git status --porcelain
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~10)..HEAD
ls .changeset/*.md | grep -v README | grep -v config
```

- If `git status` is non-empty → stop, ask the user to commit.
- If the log has no commits since the last tag (or HEAD~10 if no tags) → stop, nothing to ship.
- Note any existing changeset markdowns.

### 2. Pick the bump

Read the diff and suggest a bump per the table in
[AGENTS.md → Versioning (lockstep)](../../../AGENTS.md):

| Change                                                                 | Bump  |
| ---------------------------------------------------------------------- | ----- |
| Breaking change in any public API                                      | major |
| New public feature                                                     | minor |
| Bug fix, doc-only, internal refactor, dep bump without consumer impact | patch |

Tell the user the suggestion + the highest-severity reason. They confirm or override.

### 3. Verify the marketing site is in sync

Run the grep cheat-sheet to surface any stale references the diff may have missed:

```bash
rg --type=md --type=mdx -- 'pjt\.|--force|--yes|gitignores\.|regionFile|jsonMerge|ownFile|seedFile|directory\b|blueprint|projitect' apps/website/src/
```

Sample the matches against the diff. If a CLI flag was renamed and a `docs/cli/*.mdx` still
mentions the old name, **stop** and tell the user to fix that first. The release-bump skill
does not modify docs — that's the implementation phase's job per AGENTS.md.

### 4. Run the verification gates

```bash
pnpm check-all
pnpm --filter website check:errors
pnpm --filter website check:examples
pnpm --filter website build
```

If any fail → stop, surface the failure.

### 5. Write the changeset

Run interactively:

```bash
pnpm changeset
```

Pick all public packages (every `@projitect/*` except `@projitect/test-kit` if
it's marked internal). Pick the bump from step 2. Draft the summary using this template:

```
<one-sentence headline of what changed>

<bulleted list of user-facing changes — what they'll see, not what we did>
```

### 6. Commit the changeset

```bash
git add .changeset/*.md
git commit -m "chore(release): changeset for v<version>"
```

### 7. Push + open PR (or merge directly)

If working on a branch:

```bash
git push -u origin HEAD
gh pr create --fill
```

Otherwise, push to `main` directly. `changesets/action` will open a "Version Packages" PR
automatically — merging that PR triggers the actual npm publish via OIDC. Tell the user where
to watch the workflow. The first release is blocked until the owner completes the npm
trusted-publisher checklist in `docs/publishing.md`, and it is confirmed only when
`pnpm view @projitect/cli version` returns the released version — a green job is not confirmation.

## What this skill never does

- **Does not edit marketing docs.** Stale references are the implementation phase's problem,
  not the release phase's.
- **Does not bump versions by hand.** `pnpm changeset version` (run by CI on merge of the
  Version Packages PR) handles that.
- **Does not run `npm publish` directly.** The CI workflow has OIDC trust; local publishes
  bypass the audit trail.
- **Does not amend or force-push.** If something's wrong, fix forward with another commit.

## Failure modes

- `pnpm changeset` errors with "no packages selected" → user picked an empty set. Re-prompt.
- `pnpm check-all` fails on `check:errors` → an error id without an MDX page. The implementation
  PR is missing a docs file. Add it (or remove the unused error id).
- `astro build` fails on broken markdown → see the build log; usually a frontmatter issue.
- `gh pr create` errors → likely no remote configured. Walk the user through `git remote add`.
