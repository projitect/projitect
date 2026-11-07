---
"projitect": minor
---

`pjt build` and `pjt remodel` run a ChangeSet's `Exec` commands in a final phase after every file
operation has succeeded, gated by the blueprint's `exec` permission. `--json` is accepted by
`build` and `remodel` and carries the result or the error's id and fields. `pjt inspect` fails with
the new `pjt.inspect.operation-unsupported` error id when a project declares commands.

New error id → **minor** per the AGENTS.md "Versioning (lockstep)" table.
