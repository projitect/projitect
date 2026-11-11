---
"@projitect/cli": patch
---

Post-apply fix commands and inspect checks now find tools installed in the project: a bare program
name resolves from `<projectRoot>/node_modules/.bin` first, then the system `PATH`, so `pjt` no longer
needs a package-manager wrapper to run `eslint` and the like (it failed with `spawn eslint ENOENT`).
Explicit paths run as given, operators stay literal, and `process.env` is never modified.
On Windows, cross-spawn may use `cmd.exe` for shims and scripts; the runner refuses `%`, CR, LF
and NUL in programs, arguments and resolved executable paths with `pjt.exec.command-failed`
rather than allowing expansion or silently changing the input.
A tool found nowhere still fails with `pjt.exec.command-failed`, and the message now lists where it
looked. Adds the `which` and `cross-spawn` dependencies to `@projitect/cli-internals`.
