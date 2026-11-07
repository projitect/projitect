---
name: push-pr
description: Push the current branch and open a projitect pull request with a Conventional Commits title (it becomes the merge-commit subject). Verifies a clean tree, a changeset and `pnpm check-all` first. Use when the user asks to push or open a PR.
---

# push-pr

PRs here are **merge-commit** PRs (never squash), so the PR title becomes the merge commit subject and
must be conventional, e.g. `fix(deps): update dependency sharp (#35)`.

## Steps

### 1. Preconditions

- `git status` is clean. If not, commit first with [create-commit](../create-commit/SKILL.md).
- You are on a feature branch, not `main`. If on `main`, ask the user for a branch name first.
- A change to a published package has its `.changeset/<kebab>.md` (frontmatter `"projitect": <bump>`; see
  [AGENTS.md → Versioning (lockstep)](../../AGENTS.md)). Kanban-bundle, `.claude/` and website-only changes do not need one.
- Docs are in the same PR as the code (no "docs follow-up" PRs).

### 2. Gate

Run `pnpm check-all` (bare). Fix the root cause of any failure; never skip or loosen a check. For
website/CLI-affecting changes also run the CI-only checks listed in AGENTS.md → Verification ritual
(`pnpm build` first).

### 3. Push

```
git push -u origin HEAD
```

No `--force`. If the push is rejected after a rebase, use [rebase-main](../rebase-main/SKILL.md)'s
`--force-with-lease` rules.

### 4. Open the PR

Write the body to a temp file with the Write tool (summary, why, test evidence, marketing pages touched or
"none", and a note if no lint rule could enforce a new constraint), then:

```
gh pr create --title "feat(scope): summary" --body-file <path>
```

Never a heredoc. Append the attribution line from the session's instructions to the body if one is given.
Include `[kanban #<id>]` in the title only when a card is involved.

### 5. Stop

Report the PR URL. Do **not** run `gh pr merge` — merging is gated and belongs to the human. When merged
it is a merge commit, never a squash.
