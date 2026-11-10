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

## Keep the entry point small

AGENTS.md is a short index loaded into every session. `pnpm check:guidance` warns above 400 lines and fails above 24 KiB. Do not add "read all docs first" instructions; link the specific page or heading that applies.

A user-facing change also updates the website in the same PR; see [Marketing site](marketing-site.md).

## Guidance that is missing or unclear

If a rule you needed is missing, unclear or contradictory, report it as a follow-up that names the topic and the page or skill that should own it. Do not default to "add it to AGENTS.md"; a small routing row is right only when the page already exists but cannot be found. Where a rule can be enforced mechanically, prefer a lint rule or a check over prose (see [Tooling](tooling.md#reach-for-eslint-first)).

## What the check covers

`scripts/check-guidance.mjs` verifies that `CLAUDE.md` is a symlink to AGENTS.md, that AGENTS.md is within its size limit, that relative links and heading anchors in AGENTS.md, `docs/` and `.claude/skills/` resolve, that every page under `docs/` is linked from the index, and that each skill's `name` matches its directory and has a `description`. It cannot prove that an agent picks a skill; for a substantive trigger change, try a realistic request.
