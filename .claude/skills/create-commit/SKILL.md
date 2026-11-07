---
name: create-commit
description: Stage and commit the current changes the projitect way — one concept per commit, a Conventional Commits subject, the kanban card suffix when a card is involved, a changeset when a published package changed, and never `--no-verify`. Use when the user asks to commit.
---

# create-commit

Turns the working tree into one or more cohesive, signed commits. The rules come from
[AGENTS.md → Commits and PRs](../../AGENTS.md).

## Steps

### 1. Look at what changed

Run each as a separate call:

- `git status`
- `git diff`
- `git log --oneline -5` (match the recent subject style)

If the changes span more than one concept, plan one commit per concept and stage each with explicit
paths (`git add <path>`). Never `git add -A` blindly, and never stage `.env.local` or other secrets.

### 2. Check whether a changeset is needed

If the diff touches a published package (`projitect` or any `@projitect/*` — see the package table in
AGENTS.md; `apps/website` and `.claude/` do not count), the PR needs a hand-written
`.changeset/<kebab-name>.md`:

```md
---
"projitect": minor
---

<one-sentence headline>
```

Pick the bump from [AGENTS.md → Versioning (lockstep)](../../AGENTS.md): breaking → major, new public
feature → minor, fix/refactor/doc-only → patch. When in doubt, pick the higher one. Commit the changeset
with the change it describes, or as its own `chore` commit.

### 3. Write the subject

Conventional Commits: `<type>(<scope>): <summary>` — types `feat`, `fix`, `docs`, `refactor`, `test`,
`chore`, `ci`, `build`; scope is the package or area (`cli`, `core`, `blueprint-gitignore`, `deps`).
Imperative, lower-case, no trailing period.

If a kanban card is involved (the work came from a `/kanban-*` run), append `[kanban #<CARD_ID>]` to the
subject, e.g. `feat(cli): add --json to pjt inspect [kanban #42]`. Otherwise leave it off. If Trello is
not configured, never add it.

### 4. Commit

Use `-m`, never a heredoc:

```
git commit -m "feat(core): add pjt.foo.bar error"
```

Add the attribution trailer only if the session's attribution instruction asks for one (pass it as a
second `-m`). Signing is automatic: `commit.gpgsign=true` is set by `scripts/setup-signing.sh`, which
the `SessionStart` hook runs. If git complains about `user.signingkey`, run `bash scripts/setup-signing.sh`.

### 5. If the pre-commit hook fails

`lint-staged` runs ESLint + Prettier on staged files. Read the output, fix the root cause, re-stage the
files, and make a **new** commit. Never `--no-verify`, never `--amend` a commit that did not land.

### 6. Repeat for each concept, then confirm

Run `git status` (clean) and `git log --oneline -5`.

## What this skill never does

- Skip hooks (`--no-verify`), use `git stash`, or push. Pushing is [push-pr](../push-pr/SKILL.md).
- Squash unrelated concepts into one commit.
- Run `pnpm check-all` — that is the gate before pushing ([verify-commit](../verify-commit/SKILL.md)).
