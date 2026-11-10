---
"@projitect/cli": minor
---

New `exec` helper in `@projitect/blueprint`. `exec({ id, version, check, fix })` declares a
post-apply command: `pjt build` and `pjt remodel` run the fix command after every file operation
has succeeded, and the blueprint declares an `exec` permission for the check and fix commands.
`ExecOp` gains an optional `check` field.

New public SDK helper → **minor** per the AGENTS.md "Versioning (lockstep)" table.
