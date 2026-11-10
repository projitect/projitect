# Kanban overview

The Trello-backed kanban workflow. Index: [AGENTS.md](../../AGENTS.md); recipes: [workflows](./workflows.md).

## Kanban workflow

Day-to-day work on this repo flows through a Trello board. Cards capture ideas, get refined
into a prioritized backlog, then move through an implementation pipeline with a human
approval gate at every transition. The kanban workflow is **optional** — contributors who
don't configure it work on this repo exactly as before. Contributors who do configure it
get the `/kanban-*` skills as their primary interaction surface with Claude Code on this
project. If Trello isn't configured — no `.env.local`, or the Trello MCP server fails to
connect — skip the `/kanban-*` skills and the `[kanban #…]` commit suffix entirely; proceed
as if the kanban workflow didn't exist.

The full setup walkthrough is at [.claude/skills/kanban/SETUP.md](../../.claude/skills/kanban/SETUP.md);
the canonical reference for the board layout, transition rules, signed-comment format, and
board-scope guard is [.claude/skills/kanban/shared.md](../../.claude/skills/kanban/shared.md). The
skill bundle is adapted from
[cyanluna-git/cyanluna.skills](https://github.com/cyanluna-git/cyanluna.skills), substituting
Trello for that project's hosted Postgres board.

### Board layout — 8 columns

```
Brain Dump → Backlog → Plan → Plan Review → Impl → Impl Review → Test → Done
```

Brain Dump is the inbox — humans and agents drop raw ideas here without ceremony. Triage
moves them into Backlog with priority labels. The remaining six columns are the
implementation pipeline.

### Skills

| Skill                | What it does                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| `/kanban-init`       | One-time per-repo bootstrap. Creates lists + labels, writes `.claude/kanban.json`.  |
| `/kanban-dump`       | Fast capture to Brain Dump. Title + optional body, no follow-up questions.          |
| `/kanban-triage`     | Walk Brain Dump cards: promote, merge, refine, or archive.                          |
| `/kanban-prioritize` | Re-rank Backlog with a scoring sketch the human overrides as needed.                |
| `/kanban-refine`     | Flesh out a card's Summary, Acceptance criteria, Dependencies, Level (L1/L2/L3).    |
| `/kanban-run`        | Full pipeline orchestrator — Backlog → Done, with a human gate at every transition. |
| `/kanban`            | Foundation — primitive CRUD (list, show, add, comment, move) used by the others.    |

Pairs naturally with [`/grill-me`](../../.claude/skills/grill-me/SKILL.md) — an adversarial
interviewer that stress-tests a half-formed thought one question at a time, then proposes
the `/kanban-dump` for you. Use it whenever you'd otherwise put a fuzzy idea on the board
without thinking it through.

### Daily workflows

Common patterns — capture, triage, refine, run, watch — are walked end-to-end in
[`docs/kanban/workflows.md`](./workflows.md). Read it once when you adopt the
workflow; come back when a new situation comes up that you're not sure how to handle. From
inside Claude Code, `/kanban-help` is the interactive version — it asks what you want to do
and prints the matching recipe.

### Human-in-the-loop at every step

Every column transition fires `AskUserQuestion` first. There is no `--auto` mode. At each
gate the human can:

- **Approve** — move forward
- **Reject (stay)** — keep card in current column, comment trail records why
- **Roll back** — move to a prior column with a comment explaining what's wrong

Every mutation leaves a signed comment in the format
`> **<Actor>** · <model-or-"human"> · <ISO timestamp>` followed by the body. The card
description holds the canonical artifact (plan, implementation summary, test results);
comments are the audit trail. After three consecutive rejections at Plan Review or Impl
Review, the orchestrator hard-stops and asks the user to intervene — cyanluna's circuit
breaker, kept verbatim.

### Setup, in one paragraph

Create a Trello board; generate an API key via a Power-Up at
<https://trello.com/power-ups/admin> and a token via the `/1/authorize` URL; copy
`.env.local.example` → `.env.local` and fill in `TRELLO_API_KEY`, `TRELLO_TOKEN`,
`TRELLO_BOARD_ID`; restart Claude Code so `.mcp.json` picks up the env; run `/kanban-init`.
The MCP server is launched via `pnpm dlx @delorenj/mcp-server-trello` — no new runtime to
install. Total time ~10 minutes the first time. If any prereq is missing, every kanban skill
bails on first invocation with a pointer back to `SETUP.md`.

Per-user board overrides live in `.claude/kanban.local.json` (gitignored). Secrets live in
`.env.local` (gitignored). The committed `.claude/kanban.json` holds the board id and the
list ids that teammates share.

### Trello tokens are account-wide — board scoping is defense-in-depth

Trello has no native "single-board" token. The MCP server (`@delorenj/mcp-server-trello`)
enforces a board scope via `TRELLO_BOARD_ID`, and every `kanban-*` skill verifies the target
card's `idBoard` matches before mutating (the "board-scope guard" in `shared.md`). For a
stronger boundary, create a dedicated Trello service account that's only invited to the
projitect board, and generate the API key + token from that account.

### Scope: contributor tooling, not a product feature

Changes to the kanban skill bundle (`.claude/skills/kanban*/`) and the supporting files
(`.mcp.json`, `.env.local.example`, `.claude/skills/kanban/bin/launch-trello-mcp.sh`,
`.claude/kanban.json`) are **contributor tooling** — they don't affect the published
projitect packages or the marketing site. The
[Marketing site coordination](../marketing-site.md#marketing-site-coordination-at-every-phase) and
[Versioning (lockstep)](../../AGENTS.md#versioning-lockstep) rules do not apply to changes in the kanban
bundle.
