---
"projitect": minor
---

New worker error ids — `pjt.worker.crashed`, `pjt.worker.timed-out` and `pjt.worker.exited-early` —
with error pages and `pjt explain` entries. Blueprint file access now resolves symlinks and
re-checks permissions against the real path, so a link pointing outside the project is denied.
`@projitect/cli-internals` gains an IPC protocol, server and client for `BlueprintFileSystem`.

New public error ids → **minor** per the AGENTS.md "Versioning (lockstep)" table.
