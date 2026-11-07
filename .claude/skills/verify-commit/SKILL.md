---
name: verify-commit
description: Audit the latest commit (or every commit on the branch) against projitect's rules — conventional subject, one concept, kanban suffix, changeset, signature, marketing-site coverage — then run `pnpm check-all`. Use before pushing or when asked to check a commit.
---

# verify-commit

A read-only audit. It reports problems; it does not rewrite history.

## Steps

### 1. Pick the range

Default to the last commit. For the whole branch, use `git log --oneline origin/main..HEAD`.

### 2. Inspect

Run each as a separate call:

- `git log --format=fuller origin/main..HEAD`
- `git show --stat HEAD` (repeat per commit in the range)
- `git log --format="%h %G? %s" origin/main..HEAD`

### 3. Check each commit

| Check          | Pass condition                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Subject        | Conventional Commits (`type(scope): summary`), imperative                                                   |
| One concept    | The diff is explainable by the subject alone; unrelated changes belong in their own commit                  |
| Kanban suffix  | `[kanban #<id>]` present if a card drove the work; absent otherwise                                         |
| Changeset      | If a published package changed, the branch has a `.changeset/<kebab>.md` with `"projitect": <bump>`         |
| Bump level     | Matches [AGENTS.md → Versioning (lockstep)](../../../AGENTS.md)                                             |
| Signature      | `%G?` is `G` (good). `N` means unsigned — run `bash scripts/setup-signing.sh` and report it                 |
| Marketing site | User-facing changes touch the pages listed in [AGENTS.md → Marketing site coordination](../../../AGENTS.md) |
| No bypasses    | No `as any`, `@ts-ignore`, `.skip`, or deleted tests without replacement                                    |

### 4. Run the gate

`pnpm check-all` (bare, no flags or redirects). If the change touched error ids or website examples,
run `pnpm build` first, then `pnpm --filter website check:errors` and/or
`pnpm --filter website check:examples`. If it touched the CLI pipeline, also run `./scripts/smoke.sh`.

### 5. Report

List each failed check with the commit hash and the fix. Fixes happen forward in new commits through
[create-commit](../create-commit/SKILL.md); do not force-push to repair history unless the user asks
(then use [rebase-main](../rebase-main/SKILL.md)'s lease rules).
