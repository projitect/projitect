# projitect documentation

Start at [AGENTS.md](../AGENTS.md) for the short index and task routing. Read the page that matches the work; no page here is required for every session.

| Need                                                 | Current guidance                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Clone to a green `pnpm check-all`                    | [Getting started](getting-started.md)                                                                              |
| Packages, pipeline, ownership modes, soft sandbox    | [Architecture](architecture.md)                                                                                    |
| Blueprints, region markers, ownership, error ids     | [Blueprint authoring](blueprint-authoring.md)                                                                      |
| ESLint, Prettier, hooks, Effect language service, CI | [Tooling](tooling.md)                                                                                              |
| Website changes that ship with a feature             | [Marketing site](marketing-site.md)                                                                                |
| Releases, changesets, lockstep versioning            | [Publishing](publishing.md)                                                                                        |
| Commit signing                                       | [Signed commits](agents-signing.md)                                                                                |
| Optional Trello kanban workflow                      | [Overview](kanban/overview.md), [daily workflows](kanban/workflows.md)                                             |
| Changing AGENTS.md, docs or skills                   | [Guidance maintenance](guidance-maintenance.md)                                                                    |
| Background and past decisions                        | [Agent guidance survey](research/agent-guidance-survey.md) (ampm and StoryCut practices, with adopt/skip verdicts) |

Effect and FP conventions live in the [effect-conventions](../.claude/skills/effect-conventions/SKILL.md) and [fp-utilities](../.claude/skills/fp-utilities/SKILL.md) skills.

`pnpm check:guidance` fails when a page here is not linked from this index. Add new pages to the table above.
