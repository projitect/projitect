---
"@projitect/cli": major
---

`BlueprintFileSystem` gains required `readFileBytes` and `writeFileBytes` (`Uint8Array`), gated by
the same read and write permissions as the text methods and carried exactly over the IPC
transport, so every implementation of the interface must add them. The `.pjt.lock` schema moves
to version 2, which adds an optional per-entry `contentHash`; projitect still reads version 1
lockfiles and writes version 2.

Public file system shape and lockfile schema change → **major** per the AGENTS.md "Versioning
(lockstep)" table.
