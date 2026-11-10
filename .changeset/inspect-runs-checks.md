---
"@projitect/cli": major
---

`pjt inspect` runs the check command of every post-apply `Exec` operation through the
permission-gated runner and reports a failing check as drift (exit 1). `inspect --json` gains a
`commands` array with one entry per failing check. `pjt explain` with no error id lists the
project's post-apply commands, in text or with `--json`.

**Breaking:** the `pjt.inspect.operation-unsupported` error id, the `OperationUnsupportedOnInspect`
class and the `InspectError` type are removed from `@projitect/core`. Migration: `pjt inspect` now
runs each command's `check`, reports a failing check as drift, and no longer returns that error;
remove any handling of the old id and gate CI on the exit code or the `commands` array.
