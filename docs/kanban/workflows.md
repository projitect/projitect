# Kanban workflows

Day-to-day recipes for working with the projitect kanban board. If this is your first time,
do the [one-time setup](../../.claude/skills/kanban/SETUP.md) first.

The workflows below progress from "I just had a thought" to "I shipped it". Pick the entry
point that matches your situation — you don't need to run them in order.

> **Don't want to read this whole thing?** From inside Claude Code, run `/kanban-help`. It
> asks what you want to do and gives you the exact recipe from this file.

## Quick reference

| You want to…                              | Run                                                     | See                                                                             |
| ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Set up kanban for the first time          | follow [SETUP.md](../../.claude/skills/kanban/SETUP.md) | [§1](#1-initial-setup-once-per-repo-per-machine)                                |
| Stress-test a fuzzy idea before saving it | `/grill-me`                                             | [§2](#2-grill-then-dump-you-have-a-half-formed-thought)                         |
| Capture an idea fast and keep working     | `/kanban-dump "<idea>"`                                 | [§3](#3-dump-now-refine-later-youre-mid-flow-and-dont-want-to-lose-the-thought) |
| Process the Brain Dump column             | `/kanban-triage`                                        | [§5](#5-process-the-brain-dump-you-have-5-cards-in-brain-dump)                  |
| Re-rank the Backlog                       | `/kanban-prioritize`                                    | [§6](#6-re-rank-the-backlog-youre-about-to-start-planning-work)                 |
| Flesh out a thin card                     | `/kanban-refine <id>`                                   | [§7](#7-flesh-out-a-card-before-planning-it-the-card-is-one-liner-thin)         |
| Push a specific card to Done              | `/kanban-run <id>`                                      | [§8](#8-push-a-specific-ticket-all-the-way-through-you-know-what-you-want-next) |
| Take a raw idea all the way to Done       | dump → triage → refine → run                            | [§9](#9-chase-an-idea-cold-from-brain-dump-to-done-in-one-sitting)              |
| Watch a card ship with minimal effort     | `/kanban-run <id>` + quick approvals                    | [§10](#10-watch-with-minimal-involvement-you-trust-the-agents-on-this-card)     |
| Promote a BACKLOG story to a card         | copy id + `Depends on:`, hold if unmet                  | [Promoting BACKLOG stories](#promoting-backlog-stories-to-cards)                |

---

## 1. Initial setup (once per repo, per machine)

Follow [SETUP.md](../../.claude/skills/kanban/SETUP.md) end-to-end the first time you clone
projitect on a new machine. Roughly ten minutes:

1. Create a Trello board (or reuse an existing one).
2. Generate a Trello API key (Power-Up admin) and token (`/1/authorize` URL).
3. `cp .env.local.example .env.local`, fill in `TRELLO_API_KEY`, `TRELLO_TOKEN`,
   `TRELLO_BOARD_ID`.
4. Restart Claude Code so `.mcp.json` picks up the env.
5. Run `/kanban-init` — creates the 8 lists + 3 priority labels, writes
   `.claude/kanban.json`.
6. Run `/kanban status` — all green.

`.claude/kanban.json` gets committed (teammates share it); `.env.local` does not (gitignored).

---

## 2. Grill, then dump (you have a half-formed thought)

You're not sure if the idea is real. You want pushback before it goes on the board.

```
/grill-me
```

`/grill-me` asks one targeted question at a time, challenges vague claims, and stops when the
major branches are resolved. It ends with a structured summary whose last line usually
proposes the dump:

```
**Suggested next step** — /kanban-dump "<thesis>"
```

Run that next:

```
/kanban-dump "<thesis>"
```

The card lands in Brain Dump with a signed creation comment. If grilling concluded "discard —
not worth pursuing", **skip the dump**. The point of grilling was to know that.

---

## 3. Dump now, refine later (you're mid-flow and don't want to lose the thought)

You're working on something else and a different idea bubbles up. Don't break flow.

```
/kanban-dump "fix the stale tsconfig refs — affects packages/core build"
```

That's it — one shot, no follow-up questions, back to what you were doing. Refinement happens
at triage time, not capture time.

You (or any agent) can dump while doing anything else. The Brain Dump column is meant to be
messy.

---

## 4. Capture from inside a Claude Code session you didn't plan to capture from

Same as §3, but invoked by Claude on your behalf when _you_ mention something in passing. For
example, if you say "we should fix that someday", Claude can `/kanban-dump` it for you without
derailing the current task.

You'll see one line confirming the capture, then the original task continues.

---

## 5. Process the Brain Dump (you have ≥5 cards in Brain Dump)

Run this periodically — weekly is a good rhythm, or whenever Brain Dump feels noisy.

```
/kanban-triage
```

`/kanban-triage` walks each Brain Dump card in order and asks you per card: **Promote /
Refine then promote / Merge into existing / Refine in place / Archive / Skip**. Every
decision is logged as a signed comment on the card so you can reconstruct what happened
later.

After triage, your Backlog has new entries and Brain Dump is shorter. The cards that ended up
in Backlog might need ranking — see §6.

---

## 6. Re-rank the Backlog (you're about to start planning work)

```
/kanban-prioritize
```

`/kanban-prioritize` reads the Backlog, computes a score per card based on priority label,
dependency bottleneck status, refinement completeness, and staleness, then shows you a
current-vs-proposed diff. You approve, override specific positions, or keep the current
order.

The skill flags cards that lack acceptance criteria — those are the natural targets for §7.

---

## 7. Flesh out a card before planning it (the card is one-liner thin)

```
/kanban-refine <card-id>
```

`/kanban-refine` walks you through Summary, Acceptance criteria, Dependencies, and Level
(L1 / L2 / L3) in question clusters — never more than 3 questions at a time. You approve the
drafted description before it lands on the card.

If grilling a card surfaces deeper unresolved questions, switch tactics: cancel the refine,
run `/grill-me`, then come back.

---

## 8. Push a specific ticket all the way through (you know what you want next)

```
/kanban list           # find the card-id you want
/kanban-run <card-id>
```

`/kanban-run` is the full orchestrator. It walks the card from Backlog through Plan → Plan
Review → Impl → Impl Review → Test → Done, dispatching the Planner / Critic / Builder /
Inspector / Tester subagents at the right gates and asking you `AskUserQuestion` before
every column transition.

The asks always offer at least **Approve**, **Reject (stay)**, and **Roll back** to an
earlier column. Roll back is your friend when you spot a problem mid-pipeline.

---

## 9. Chase an idea cold, from Brain Dump to Done in one sitting

If you want to take an idea from raw capture all the way to shipped:

```
/kanban-dump "<idea>"           # capture
/kanban-triage                  # promote it (skip the others if there are none)
/kanban-refine <id>             # flesh out (skip if §2 already produced enough)
/kanban-run <id>                # pipeline
```

You'll hit 7 approval gates between Backlog and Done (one per transition). At each, you have
the full context — the agent's verdict, the card's current state, what changed. The Planner
/ Critic / Builder / Inspector / Tester subagents do the heavy lifting; you adjudicate.

---

## 10. Watch with minimal involvement (you trust the agents on this card)

There is no `--auto` mode — every transition asks. But "asks" doesn't mean "stops you for
ten minutes". If you trust the card:

- At Backlog → Plan: glance at the Planner's intended scope, approve.
- At Plan Review → Impl: read the Critic's score line and approve if it's ≥ 4.0.
- At Impl Review → Test: read the Inspector's score line and approve if it's ≥ 4.0 and no
  hard-reject flag fired.
- At Test → Done: confirm the Tester reported all PASS, approve.

For a routine card, that's four ~10-second checks across the run. The gates are friction by
design — but the friction is sized to the trust level you bring to the card.

**When to actually engage**: a Critic/Inspector score below 4.0, any hard-reject flag, a
Builder "needs replan" comment, or any Tester FAIL. Those mean the agents are surfacing a
real concern. Read the comment trail and pick the appropriate roll-back option.

---

## Promoting BACKLOG stories to cards

When a card comes from a story in [BACKLOG.md](../../BACKLOG.md), follow its
[Ordering convention](../../BACKLOG.md#ordering-convention): BACKLOG.md owns story ids, `Depends on:`
edges and shipped status; the board never overrides an edge. Triage (§5), refine (§7) and run (§8)
copy the story id and the `Depends on:` line verbatim into the card, link prerequisite cards already
on the board, and hold the card if a prerequisite is not satisfied (all its checkboxes `[x]`, or in
Shipped).

---

## Rhythms

Suggested cadences (adjust to taste):

| Cadence        | What to run                             | Why                                        |
| -------------- | --------------------------------------- | ------------------------------------------ |
| **Per moment** | `/kanban-dump` or `/grill-me`           | Capture before the thought evaporates.     |
| **Daily**      | `/kanban list`                          | Glance at what's in flight.                |
| **Weekly**     | `/kanban-triage` + `/kanban-prioritize` | Keep Brain Dump small and Backlog ordered. |
| **Per card**   | `/kanban-refine` then `/kanban-run`     | The actual work.                           |

---

## Anti-patterns

- **Dumping into Backlog directly.** Use Brain Dump. Triage exists for a reason — it forces
  the duplicate/scope check before things look "real".
- **Running `/kanban-run` on an unrefined card.** It'll either bounce back asking for
  refinement or produce a vague plan you'll reject at Plan Review. Refine first.
- **Click-through-approving on a card you don't trust.** The gates are your filter — use
  them. If you're tempted to bypass them, the card needed more refinement.
- **Promoting a story before its prerequisites are `[x]`.** Merged code is not enough; hold the card until BACKLOG.md says the dependency is satisfied.
- **Triaging during capture.** Splits attention. Capture is a separate moment from triage.
- **Grilling something you already understand.** `/grill-me` is for fuzzy ideas. If you
  already have the thesis, dump.
