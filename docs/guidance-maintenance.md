# Guidance maintenance

How to change the guidance agents and contributors read: [AGENTS.md](../AGENTS.md), the pages under `docs/` ([index](README.md)) and the skills under `.claude/skills/`.

## Place a new rule

1. If it applies to every task, put a short rule in AGENTS.md. Otherwise put it in the focused page or skill that owns the topic.
2. If it is a repeatable procedure with non-obvious steps, make it a skill. Put the trigger first in the `description` (what the user is doing, then what the skill does); descriptions are loaded before the skill body.
3. Add a routing row to AGENTS.md "Where to look" only when agents otherwise cannot discover the page. Link the `SKILL.md` directly in that row: skill selection from the description is not guaranteed, so a required procedure needs a direct path.
4. Add every new page under `docs/` to the [index](README.md).
5. Repair links that point at an old location and resolve contradictions in the same change. Put history and rationale in `docs/research/`, with the current rule stated first.
6. Run `pnpm check:guidance`.

When you edit a section, rewrite it as a whole and trim stale text; do not append patches.

## Move a topic out of AGENTS.md

Move a topic when only some tasks need it. Reference or explanation becomes a docs page; a repeatable procedure becomes a skill.

- **The page is the single home of the detail.** It does not restate AGENTS.md; it links back to the rule only where that helps the reader.
- **AGENTS.md keeps a short rule or a routing row, never a duplicate paragraph.** A rule that applies to every task stays as one to three lines; otherwise a row in "Where to look" is enough.
- **Update links and the [docs index](README.md) in the same change**, then run `pnpm check:guidance`.

Existing splits: [Signed commits](agents-signing.md) (AGENTS.md keeps a short "Commit signing" pointer), [Kanban](kanban/overview.md) (a short "Kanban workflow" section), [Getting started](getting-started.md) and [Architecture](architecture.md) (routing rows only), and [Publishing](publishing.md) (a short "Releases and dependency upgrades" section).

## Adopt a skill from another repository

Skills here were adapted from sibling repositories such as StoryCut and ampm. Adapt, never copy verbatim.

**Credit and licence.**

- Put a one-line note in the skill's own text ("Adapted from `<repo>/<path>`") or in the commit message; keep it out of the `description` frontmatter.
- Before adopting, check the source repo's LICENSE file, the `license` field in its `package.json`, and the git provenance (author and commit) of the source file. Preserve any copyright or licence notice the licence requires.
- Licence evidence for the StoryCut sources is missing: the readable sources have no LICENSE file and their `package.json` says `"UNLICENSED"`. Several existing skills (such as `create-commit` and `push-pr`) were adapted from them without attribution.
- When evidence is missing, record that precise gap, ask the repository owner, and never infer a copyright holder or a permission. Rewriting or rewording does not replace permission from the source owner; the rules below govern placement and fit only.

**Rewrite the skill to satisfy this repo's rules:**

- Commit signing and author identity ([Signed commits](agents-signing.md)).
- One concept per commit and conventional subjects.
- The `[kanban #<id>]` card suffix when a card shipped.
- pnpm only.
- The permission-prompt posture: one command per call, `-m` or `-F` commits, no heredoc.
- For the optional Trello `/kanban` workflow only: no auto mode, a human approves each transition. This does not restrict user-authorized ampm Autopilot or autonomous routine work.
- The board-scope guard, for any skill that mutates cards (`.claude/skills/kanban/shared.md`).

**Changeset.** The Versioning rule in AGENTS.md requires one only when a published package changes. A skill under `.claude/skills/` is not published, so it needs none; a skill shipped through `@projitect/blueprint-skills` is a package change and does.

Add the skill to AGENTS.md's skill table only if it is a required procedure.

## Keep the entry point small

AGENTS.md is a short index loaded into every session. `pnpm check:guidance` warns above 400 lines and fails above 24 KiB. Do not add "read all docs first" instructions; link the specific page or heading that applies.

A user-facing change also updates the website in the same PR; see [Marketing site](marketing-site.md).

## Guidance that is missing or unclear

If a rule you needed is missing, unclear or contradictory, report it as a follow-up that names the topic and the page or skill that should own it. Do not default to "add it to AGENTS.md"; a small routing row is right only when the page already exists but cannot be found. Where a rule can be enforced mechanically, prefer a lint rule or a check over prose (see [Tooling](tooling.md#reach-for-eslint-first)).

## What the check covers

`scripts/check-guidance.mjs` verifies that `CLAUDE.md` is a symlink to AGENTS.md, that AGENTS.md is within its size limit, that relative links and heading anchors in AGENTS.md, `docs/` and `.claude/skills/` resolve, that every page under `docs/` is linked from the index, and that each skill's `name` matches its directory and has a `description`. It cannot prove that an agent picks a skill; for a substantive trigger change, try a realistic request.
