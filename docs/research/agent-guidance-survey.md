# Agent guidance survey: ampm and StoryCut

Written 2026-11-10 as a survey against projitect `6b6af37` (AGENTS.md 1084 lines), which is the historical baseline for this note. After review the operator directed three of its proposed follow-ups to be implemented in the same PR: a guidance check, a docs index with a guidance-maintenance guide, and direct skill links from AGENTS.md (section 8). Sections 2–5 and the practice table therefore describe projitect before those adoptions and before tk-41433c70 landed; they are kept as the evidence the adoptions rest on, not as the current state. No follow-up has been filed on the board.

## 1. Source access

**Route.** Neither repo is checked out in the workspace, `gh` is unavailable, and there is no `GITHUB_TOKEN`. Both repos were readable from local copies:

- Bare origins with full history, read with `git --git-dir=<path> show HEAD:<file>` / `ls-tree` / `grep`: `/workspaces/origins/nunofyobiz__ampm.git` at `eb8373cd9af902fc04ceee89744c2d3c25aefb5d`, and `/workspaces/origins/StoryCut__StoryCut.git` at `5faab358470fc217e87f16e74017dc074c882dba`. Every claim below about file contents comes from these.
- Working-tree copies in `/workspaces/contexts/nunofyobiz--ampm` and `/workspaces/contexts/StoryCut--StoryCut` were used only for directory listings and line counts. They have no `.git`, so their commit could not be compared with the origins' `HEAD`.

**Not readable.** GitHub over the web is not used (ampm is private). CI run history, PR discussion and GitHub settings of either repo were not read. Whether ampm's `setup/check-guidance.mjs` runs in CI is unconfirmed: a grep of `HEAD` finds it named only in docs and skills, not in `package.json` or `.github/`. Its unit test is `setup/check-guidance.test.mjs`.

**Files consulted (repo-relative).**

- ampm: `AGENTS.md`, `docs/README.md`, `docs/agent-guidance/maintenance.md`, `docs/agent-guidance/migration-map.md` (listed, not read in full), `.agents/skills/ampm-guidance-maintenance/SKILL.md`, `.claude/skills/ampm-guidance-maintenance/SKILL.md`, `setup/check-guidance.mjs`, `.claude/settings.json`; directory listings of `docs/`, `.agents/skills/`, `.claude/skills/`, `.ampm/`, `setup/`.
- StoryCut: `AGENTS.md`, `docs/index.md`, `docs/dev-guides/index.md`, `.claude/skills/new-module/SKILL.md`, `.claude/settings.json`, `.husky/pre-commit`, `.husky/commit-msg`, `commitlint.config.ts`, `eslint.config.ts` (grep for `no-restricted-imports` only); listings of `docs/`, `.claude/skills/`, `scripts/`, `.husky/`.
- projitect: `AGENTS.md`, `docs/`, `.claude/skills/`.

## 2. AGENTS.md structure

| | ampm | StoryCut | projitect |
| --- | --- | --- | --- |
| Length | 63 lines | 1056 lines | 1084 lines |
| Shape | Index: universal safety rules, a commands table, a "when the work touches… read X / skill Y" routing table | Handbook: Effect, FP, tests, React, sort orders, commits, plus a skills trigger table | Handbook: same inherited sections plus kanban, CI, signing |
| Detail lives in | `docs/architecture`, `docs/development`, `docs/agent-guidance`, `.agents/skills` | `docs/` (4 architecture pages, 5 dev guides), skills | `docs/*.md` (3 orientation pages + `docs/kanban`) |
| CLAUDE.md | symlink | symlink | symlink |
| Edit rule | "update routing only when adding or changing a topic" | "rewrite the whole section, no appended patches" | same rule as StoryCut |

projitect's handbook shape is inherited from StoryCut. ampm shows the index shape that tk-41433c70 targets (see section 7).

## 3. Docs layout

- ampm: `docs/README.md` is a need-to-page table; it separates current guidance from background (design, research, roadmap-history). `docs/agent-guidance/` holds guidance about guidance. `docs/public/` is published and has its own registry and tests.
- StoryCut: `docs/index.md` is a table of contents over `architecture/` and `dev-guides/` (each with its own `index.md`). No routing from AGENTS.md by task.
- projitect: flat `docs/` with three orientation pages and `docs/kanban/`; no index page and no current-versus-history split.

## 4. Skills

- **Authoring.** StoryCut: skills only in `.claude/skills/`, descriptions are trigger-first ("Use this skill when…"), and AGENTS.md carries a Workflow / Scaffolding / Reference table with each trigger (`AGENTS.md` "Skills"). ampm: one canonical copy in `.agents/skills/<name>/SKILL.md` and a thin `.claude/skills/<name>/SKILL.md` that links to it with no duplicated procedure (`docs/agent-guidance/maintenance.md` step 2). projitect: `.claude/skills/` only, with 17 skills (workflow, scaffolding, kanban) listed in AGENTS.md "Contributor skills", which gives purposes but not triggers.
- **Activation.** ampm states that selection by description is not guaranteed: every routing row that names a procedure links the `SKILL.md` directly so it is read even if unselected. StoryCut and projitect rely on the description plus the table.
- **Kept in sync.** ampm's `setup/check-guidance.mjs` checks size (warn above 500 lines or 16 KiB, fail above 24 KiB), that `CLAUDE.md` symlinks to `AGENTS.md`, that every guide under `docs/{architecture,development,agent-guidance,operations}` is reachable from `docs/README.md`, that relative links and heading anchors resolve, and skill frontmatter. projitect has no equivalent; a known symptom is tk-60e625fb (broken `../../AGENTS.md` links in `release-bump`).
- **Migration audit.** ampm's `docs/agent-guidance/migration-map.md` maps every section of the old AGENTS.md to its new home, so nothing is lost silently.

## 5. Durable guidance

- **Gap reporting.** ampm tells agents to report a missing or unclear rule as a `guidanceGaps` task naming the topic and canonical guide, not default to "add it to AGENTS.md" (`docs/agent-guidance/maintenance.md`, "Guidance gaps"). projitect's AGENTS.md is silent on this.
- **Lint-enforced rules.** StoryCut `eslint.config.ts` uses `no-restricted-imports`; projitect already has the same per-package sandbox bans and a "Reach for ESLint first" rule, so there is no new practice here. StoryCut's commit hooks add `commitlint` on `commit-msg`; projitect deliberately has none.
- **Hooks.** StoryCut's `.claude/settings.json` has `SessionStart` (worktree git setup) and `WorktreeRemove`/`SessionEnd` cleanup hooks; ampm has a `SessionEnd` hook. projitect has `SessionStart` signing setup only.
- **Product guide kept in sync by tests.** ampm fails tests when UI labels drift from `packages/core/src/guide/`. projitect's analogue is `check:examples` / `check:errors`, which already exist.

## 6. Practice table

| # | Practice | Source | Fit / conflict with projitect rules | Verdict | Reason |
| --- | --- | --- | --- | --- | --- |
| 1 | AGENTS.md as ~60-line routing index | ampm `AGENTS.md` | Fits; conflicts with the current handbook | Covered | Owned by tk-41433c70; not re-proposed |
| 2 | Routing table "work touches X → read Y, skill Z" | ampm `AGENTS.md` | Fits; needs tk-41433c70's moved docs to exist | Covered | Part of tk-41433c70's index |
| 3 | Link the SKILL.md directly in routing rows because selection is not guaranteed | ampm `AGENTS.md`, `maintenance.md` | Fits "Contributor skills" table | Adopt | Cheap and addresses unreliable activation |
| 4 | Trigger-first skill descriptions | StoryCut `.claude/skills/new-module/SKILL.md`; ampm `maintenance.md` | Fits; projitect skills already adapted from StoryCut | Skip | Already present for most skills; no separate work |
| 5 | Skills-trigger table in AGENTS.md | StoryCut `AGENTS.md` "Skills" | Partly present as "Contributor skills" table | Skip | Superseded by item 3 and tk-41433c70 |
| 6 | Canonical `.agents/skills` + `.claude/skills` shims | ampm `maintenance.md` | Conflicts: projitect's skills (including kanban) are Claude-only and contributor tooling; a second tree is churn with no stated Codex user | Skip | Revisit only if non-Claude agents are used on this repo |
| 7 | `check-guidance` script (size cap, symlink, index reachability, link and anchor check, skill frontmatter) | ampm `setup/check-guidance.mjs` | Fits "Reach for ESLint first" (mechanical enforcement); no package change, so no changeset | Adopt | Would have caught tk-60e625fb and protects the symlink and tk-41433c70's retargeted links |
| 8 | Wire the check into CI and lint-staged | ampm (not confirmed wired, see section 1) | Fits CI job-per-check layout | Adopt (with 7) | A check that is not run does not enforce |
| 9 | `docs/README.md` need-to-page index with current versus history split | ampm `docs/README.md` | Fits; docs have no index today | Adopt | tk-41433c70 retargets links but does not add an index page |
| 10 | Guidance-maintenance guide and skill ("where does a new rule go") | ampm `maintenance.md`, `ampm-guidance-maintenance` | Fits AGENTS.md "rewrite the section cohesively" rule | Adopt | Gives the rewrite rule and placement rules a home once AGENTS.md is an index |
| 11 | Report guidance gaps as follow-ups naming the topic and guide | ampm `maintenance.md` "Guidance gaps" | Fits; projitect is silent | Adopt | One short paragraph, folds into item 10 |
| 12 | Migration map for the old AGENTS.md | ampm `migration-map.md` | Fits tk-41433c70's "keep every link working" scope | Skip | Belongs inside tk-41433c70's own PR, not a separate task |
| 13 | Public-docs-are-done rule with size budgets and registry | ampm `docs/README.md`, `public-docs.ts` | Already covered by "Marketing site coordination" | Skip | projitect already has stricter plan-time and PR-time gates |
| 14 | `commitlint` on `commit-msg` | StoryCut `.husky/commit-msg`, `commitlint.config.ts` | Conflicts: AGENTS.md states there is no commitlint config or hook, by choice | Skip | Deliberate decision |
| 15 | Worktree hooks (`WorktreeRemove`, `SessionEnd` cleanup, env setup) | StoryCut `.claude/settings.json`, `scripts/` | Conflicts in kind: those solve dev-server and per-worktree database cleanup that projitect (a CLI) lacks | Skip | App-specific |
| 16 | StoryCut app rules (React/JSX, className, `nn`, `FormDataX`, feature flags, Next client component, FCPXML/OTIO/Remotion skills) | StoryCut `AGENTS.md`, skills | No fit: product-specific | Skip | App-specific |
| 17 | Effect, FP, sort-order, Match sections | StoryCut `AGENTS.md` | Already in projitect; moving them is tk-41433c70 | Covered | Not re-proposed |
| 18 | Per-package `no-restricted-imports` bans | StoryCut `eslint.config.ts`; projitect `eslint.config.js` | Already in place | Skip | Nothing to adopt |
| 19 | Rule: do not read all docs up front; link specific headings | ampm `maintenance.md` | Fits; helps agents with a 1000-line file today | Adopt (with 10) | Short rule, belongs in the maintenance guide |

## 7. Relationship to existing work

- **tk-41433c70** (AGENTS.md as a short index; at Review PR when written). It already covers shortening AGENTS.md, moving the Effect, FP, sort-order, ESLint/CI and kanban sections into guides and skills, and retargeting links. Items 1, 2, 12 and 17 are named here and not re-proposed. The adoptions below sit around it: the index page, the check that guards its result, and the maintenance guide. They should land after it, or at least be planned against its final layout.
- **Earlier skills surveys on the board.** tk-3f036372 ("Survey the ampm repo's skills for ones worth adopting here", P3, at admission, not started because ampm was unreadable) asks to list ampm's 14 skills and pick generic ones. This note does not do that: it covers only how ampm authors and activates skills, and looked at one ampm skill. The sweep for generic ampm skills stays with tk-3f036372, and since ampm is readable from `/workspaces/origins` it can now run. it-e9413d8a (done) already adapted StoryCut's workflow skills. Items 4, 5 and 6 reflect that.

## 8. Proposed follow-ups (not filed)

**A. Add a guidance check that fails on a broken link, a broken symlink or an oversized AGENTS.md** (items 7, 8).
Body: add a script, modelled on ampm's `setup/check-guidance.mjs`, that verifies `CLAUDE.md` is a symlink to `AGENTS.md`, that AGENTS.md stays under a size cap chosen after tk-41433c70 lands, that every relative link and heading anchor in AGENTS.md, `docs/` and `.claude/skills/` resolves, and that each skill's frontmatter has `name` and `description`. Run it from `pnpm lint` or a root script, and from CI and lint-staged. It has a unit test with fixtures. No published package changes, so no changeset; the website is untouched.
Evidence: ampm `setup/check-guidance.mjs` and `setup/check-guidance.test.mjs` at `eb8373c`; tk-60e625fb, a broken-link defect the check would have caught. Confirm in ampm's CI whether it runs there.

**B. Add a docs index and a guidance-maintenance guide** (items 9, 10, 11, 19).
Body: add `docs/README.md` with a need-to-page table separating current guidance from background, and a short `docs/agent-guidance/maintenance.md` (or equivalent) saying where a new rule goes (index versus focused page versus skill), keeping the "rewrite the section cohesively" rule, linking headings instead of "read everything", and telling agents to report missing guidance as a follow-up naming the topic and guide. Plan it after tk-41433c70 so it describes the final layout. Docs only.
Evidence: ampm `docs/README.md`, `docs/agent-guidance/maintenance.md`, `.agents/skills/ampm-guidance-maintenance/SKILL.md`.

**C. Link each skill directly from the AGENTS.md routing rows** (item 3). Small enough to fold into tk-41433c70's index if it has not merged; otherwise a small docs change after it. Evidence: ampm `AGENTS.md` ("read its linked `SKILL.md` directly if it was not selected").

C should be merged into tk-41433c70 or B rather than filed alone.
