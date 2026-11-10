---
"@projitect/cli": minor
---

`pjt inspect` runs the check command of every post-apply `Exec` operation through the
permission-gated runner and reports a failing check as drift (exit 1). `inspect --json` gains a
`commands` array with one entry per failing check. `pjt explain` with no error id lists the
project's post-apply commands, in text or with `--json`.
