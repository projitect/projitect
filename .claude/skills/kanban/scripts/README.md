# kanban — scripts

Deterministic helpers for the Trello-backed kanban workflow. The sibling `/kanban-*` skills
under [..](..) delegate API choreography to these scripts and keep the LLM responsible only
for conversation, `AskUserQuestion` gates, free-text parsing, and `Task`-dispatched
subagents.

The scripts talk to Trello directly via REST (typed client in [lib/client.ts](./lib/client.ts))
— they do not go through the Trello MCP. MCP is for the LLM's runtime; scripts are for
deterministic work.

## Convention

- TypeScript, ESM, run via `pnpm exec tsx .claude/skills/kanban/scripts/<name>.ts <args>`
- Two scripts have convenience npm aliases: `pnpm kanban:status`, `pnpm kanban:score`
- Credentials from env: `TRELLO_API_KEY`, `TRELLO_TOKEN` (always required);
  `TRELLO_BOARD_ID` (only needed for scripts that operate on the configured board)
- Per-project config from `.claude/kanban.json` (committed) + optional
  `.claude/kanban.local.json` (per-user, gitignored, deep-merged on top)
- Stdout = structured JSON (machine-readable). Stderr = human-readable errors.
- Exit codes: `0` success · `1` generic error · `2` precondition not met
  (missing config, bad env) · `3` transition refused (move-card-validated)

## Scripts

| Script                                                       | Purpose                                                             | Args / IO                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`board-scope-guard.ts`](./board-scope-guard.ts)             | Exit 0 if the given card belongs to the configured board            | `<card-id>`                                                        |
| [`status-check.ts`](./status-check.ts)                       | Sanity-check env, kanban.json, and live board reachability          | (none) — JSON report                                               |
| [`reconcile-lists.ts`](./reconcile-lists.ts)                 | Ensure the 8 required lists exist on a board                        | `<board-id>`                                                       |
| [`reconcile-labels.ts`](./reconcile-labels.ts)               | Ensure the 3 priority labels exist on a board                       | `<board-id>`                                                       |
| [`write-kanban-json.ts`](./write-kanban-json.ts)             | Write `.claude/kanban.json`; show diff before overwrite             | stdin JSON; `--force` to skip diff                                 |
| [`bootstrap-board.ts`](./bootstrap-board.ts)                 | Resolve or create board, reconcile lists + labels, write config     | `--board-id X` OR `--create --name … --workspace … --visibility …` |
| [`append-signed-comment.ts`](./append-signed-comment.ts)     | Post a signed comment on a card                                     | `--card-id`, `--actor`, `--model`, `[--suffix]`; body via stdin    |
| [`move-card-validated.ts`](./move-card-validated.ts)         | Move a card with transition-matrix validation + audit-trail comment | `--card-id`, `--to <listKey>`, `[--notes …]`                       |
| [`render-card-description.ts`](./render-card-description.ts) | Render the card description schema from JSON                        | stdin JSON → stdout markdown                                       |
| [`parse-card-description.ts`](./parse-card-description.ts)   | Parse a card description back into structured JSON                  | stdin markdown → stdout JSON                                       |
| [`extract-section.ts`](./extract-section.ts)                 | Extract one section (Plan, Impl notes, …) from a card description   | `<card-id> <section-name>`                                         |
| [`card-summary.ts`](./card-summary.ts)                       | Render a card for human reading                                     | `<card-id> [--comments N]`                                         |
| [`score-backlog.ts`](./score-backlog.ts)                     | Score every Backlog card per the prioritization rubric              | (none) — JSON array                                                |
| [`recipe-lookup.ts`](./recipe-lookup.ts)                     | Print the canned recipe text for a `/kanban-help` selection         | `<bucket> <intent>`                                                |

Sibling launcher: [`../bin/launch-trello-mcp.sh`](../bin/launch-trello-mcp.sh) — invoked by
`.mcp.json` at session start, sources `.env.local`, runs `pnpm dlx @delorenj/mcp-server-trello`.

## Library

Under [`lib/`](./lib/):

- [`types.ts`](./lib/types.ts) — shared API + config types, `LIST_KEYS`, `LABEL_KEYS`,
  display names, label colors
- [`client.ts`](./lib/client.ts) — typed Trello REST client
- [`config.ts`](./lib/config.ts) — loads `.claude/kanban.json` (+ local override) and env
- [`transitions.ts`](./lib/transitions.ts) — status matrix; `isValidTransition`
- [`signed-comment.ts`](./lib/signed-comment.ts) — signed-comment format
- [`description-schema.ts`](./lib/description-schema.ts) — render/parse/extract for the
  card description schema
- [`exit.ts`](./lib/exit.ts) — `die`, `printJson`, `readStdin`, `parseArgs` wrapper
- [`narrow.ts`](./lib/narrow.ts) — type-narrowing helpers (`asObject`, `stringFrom`, etc.)

## How a skill calls these

The pattern: skill body calls the script, captures stdout, makes a decision (with
`AskUserQuestion` if needed), maybe calls another script.

Example — `/kanban-dump`:

1. Skill parses the user's free-text into `{ title, body }` (LLM judgment)
2. Skill builds a card-parts JSON `{ summary: body, … }` and pipes to
   `render-card-description.ts` to get the markdown description
3. Skill calls Trello MCP `add_card_to_list` (or the equivalent script — pick whichever
   the skill is set up to use)
4. Skill calls `append-signed-comment.ts` with `--actor "/kanban-dump" --model human` to
   leave the creation-trail comment

The scripts ensure the description schema, the signed-comment format, and the transition
matrix never drift across skills — they all live in one executable place.

## Out of scope here

- Anything requiring `AskUserQuestion` (LLM only)
- Anything requiring `Task` tool dispatch (LLM only — see kanban-run for the orchestrator)
- Free-text understanding (e.g. parsing the user's idea into title + body)
- Adversarial questioning (e.g. `/grill-me`)

## Contributor-tooling, not a published surface

These scripts are part of the kanban contributor workflow (see
[Kanban overview](../../../../docs/kanban/overview.md)). They are not part of the projitect
product. Marketing-site coordination and lockstep-versioning rules do not apply.

## Portability

Living inside the kanban skill bundle is intentional — see
[../PORTABILITY.md](../PORTABILITY.md) for the plugin-extraction plan.
