---
"projitect": major
---

The `@projitect/cli-internals` engine (`readLockfile`, `writeLockfile`, `diffPlan`, `applyPlan`,
`applyRemovals`) now reads and writes through the `BlueprintFileSystem` service instead of
`node:fs`, so it can run against the in-memory filesystem. CLI behavior is unchanged.

Migration for direct callers: drop the `projectRoot` argument, provide the new
`makeProjectRootLayer(projectRoot)` (or any `BlueprintFileSystem` layer, such as test-kit's
`makeInMemoryLayer`), and use `readLockfile` as an Effect value rather than calling it. The `path`
on `pjt.lock.parse-failed` is now the project-relative `.pjt.lock`.

Major per the AGENTS.md "Versioning (lockstep)" table: exported function signatures changed.
