---
"projitect": patch
---

Internal refactor: the lockfile, differ, applier and remover read and write through the
`BlueprintFileSystem` service instead of `node:fs`, so the engine can run against the in-memory
filesystem. The CLI wires an ungated project-root Node layer; command behavior is unchanged.
