# Marketing site

How the Astro Starlight site under `apps/website` is kept in step with the code. Index: [AGENTS.md](../AGENTS.md).

## Marketing site is latest-only

The Astro Starlight site under `apps/website` is written in **present tense as if the latest
version is the only one that ever existed**. Historical docs are out of scope for v0.x.

- Renaming a flag means updating every reference on the site, not adding a "previously named X" note.
- Removing a feature means deleting its docs, not marking them deprecated.
- Adding a feature means adding its docs in the same PR.
- Versioned URLs are not in scope.

This is a stylistic standard. Reviewers reject docs that read like a changelog.

## Marketing site coordination at every phase

The site is not a release-time chore — it's a **continuous obligation**. Three sequential gates. Docs for a feature that has not shipped are part of that
feature's task and PR, and are never scheduled as independent work ahead of or apart from the code.
A planner or reviewer who meets an existing docs-only story folds its acceptance criteria into the
parent feature's story and does not promote it as separate work.

### Plan-time

Every plan, wherever it is written, that introduces a user-facing change must explicitly list
which marketing pages it will touch. "Add `--json` flag to `pjt inspect`" without naming
`apps/website/src/content/docs/docs/cli/inspect.mdx` is an incomplete plan.

Triggers — if your change does any of the following, plan a docs edit:

| Change                                                                          | Docs to touch                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Add / rename / remove a CLI command, flag, or argument                          | `docs/cli/<cmd>.mdx`                                                                               |
| Add / rename / remove an SDK export, blueprint constructor, or permission shape | `docs/authoring.mdx` (+ maybe `docs/concepts/*.mdx`)                                               |
| Change an ownership mode's behavior or add a new mode                           | `docs/concepts/ownership-modes.mdx`                                                                |
| Add / rename a `pjt.*` error id                                                 | `errors/<id>.mdx` (gated by `check:errors`)                                                        |
| Change marketing copy that's now untrue                                         | `index.mdx` + relevant pages                                                                       |
| Add or change a worked example                                                  | `apps/website/examples/<name>/example.ts` + `docs/examples/<name>.mdx` (gated by `check:examples`) |
| Change the lockfile schema, projitect blueprint, or pipeline shape              | `docs/concepts/drift-detection.mdx` + `docs/concepts/blueprints.mdx`                               |

### Implementation-time

**The PR that lands the code change must also land the marketing edits.** No "docs follow-up"
PRs. CI gates:

- `pnpm --filter website check:errors` — every error id has an MDX page.
- `pnpm --filter website check:examples` — every example file under `apps/website/examples/` typechecks.
- `pnpm --filter website build` — the Astro site builds end-to-end.

The human reviewer additionally checks the prose on touched pages for freshness.

### Release-time

At release time the docs are already correct by construction. The procedural parts (changeset,
version bump, publish) are handled by the `release-bump` skill at `.claude/skills/release-bump/`
— see [Shipping a release](./publishing.md#shipping-a-release) for what that skill drives.
