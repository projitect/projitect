---
name: rebase-main
description: Rebase the current branch onto the latest origin/main without stashing, resolve conflicts, re-verify, and push with `--force-with-lease` (never bare `--force`). Use when a branch is behind main or the user asks to rebase.
---

# rebase-main

Keeps a feature branch current with `main`. It stays on the branch you are already on and never creates
another.

## Steps

### 1. Make the tree clean — without stash

`git status`. If dirty, commit the work (a WIP commit via [create-commit](../create-commit/SKILL.md) is fine;
squash it later with `git reset --soft HEAD~1`). **Never `git stash`** — the stash stack is shared across
worktrees.

### 2. Fetch and rebase

- `git fetch origin`
- `git rebase origin/main`

### 3. Resolve conflicts

For each conflicted file: read it, resolve the markers keeping both sides' intent, `git add <path>`, then
`git rebase --continue`. Lockfile conflicts (`pnpm-lock.yaml`): take main's version, then run `pnpm install`
and commit the result. If it goes badly, `git rebase --abort` returns to the pre-rebase state.

### 4. Re-verify

Run `pnpm check-all` (bare). Fix the root cause of any failure in a new commit.

### 5. Push

If the branch was already pushed, history changed, so:

```
git push --force-with-lease
```

Never bare `--force` (it is gated). If the lease is rejected, someone else pushed — `git fetch origin`,
inspect with `git log origin/<branch>`, and ask the user before retrying.

## What this skill never does

- `git stash`, `--no-verify`, bare `git push --force`, `git reset --hard`, or `git clean -fd`.
- Create or switch branches.
- Merge `main` into the branch (rebase only).
