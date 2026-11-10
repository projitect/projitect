---
"@projitect/cli": major
---

The `@projitect/cli-internals` engine (`readLockfile`, `writeLockfile`, `diffPlan`, `applyPlan`,
`applyRemovals`) now reads and writes through the `BlueprintFileSystem` service instead of
`node:fs`, so it can run against the in-memory filesystem. CLI behavior is unchanged.

Migration for direct callers: drop the `projectRoot` argument, provide the new
`makeProjectRootLayer(projectRoot)` (or any `BlueprintFileSystem` layer, such as test-kit's
`makeInMemoryLayer`), and use `readLockfile` as an Effect value rather than calling it. The `path`
on `pjt.lock.parse-failed` is now the project-relative `.pjt.lock`.

`BlueprintFileSystem.remove` is no longer recursive: it removes a file or symlink and fails with
`pjt.fs.write-failed` on a directory, so user content that replaced a formerly owned file is never
deleted. Blueprint code that relied on recursive removal must list and remove entries itself.

Major per the AGENTS.md "Versioning (lockstep)" table: exported function signatures changed.
