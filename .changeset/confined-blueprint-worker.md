---
"projitect": major
---

`pjt build`, `pjt remodel` and `pjt inspect` now run `.pjt.ts` and every blueprint's plan in a
child Node process started with Node's permission model. The worker can read only its own code,
the `.pjt.ts` and the dependency closure of the declared blueprints; it gets no write,
child-process or worker-thread permission, and reaches project files only through the
permission-gated `BlueprintFileSystem` served by the CLI. This prevents accidental filesystem and
process access by blueprint code and its dependencies. It does not contain deliberately malicious
code, and network access is not restricted on Node 22.12 through 24. Blueprint authors change
nothing. A worker that crashes, exits early or times out is reported as `pjt.worker.crashed`,
`pjt.worker.exited-early` or `pjt.worker.timed-out`.

Inside `directory("docs", [...])`, a child blueprint's `BlueprintFileSystem` is now rooted at
`docs/`: reading `package.json` there reads `docs/package.json`, and its permission globs are
relative to `docs/`, as documented.

The worker's environment is empty, so blueprint code no longer sees the CLI's environment
variables.

**Migration for direct callers of `@projitect/cli-internals`:** `buildPlan` now takes
`{ planned }` — the per-blueprint results (`id`, `version`, `permissions`, `directoryPrefix`,
`changeSet`) that `planBlueprintFile({ blueprintFile, projectRoot })` returns — instead of
`{ tree, projectRoot }`. `loadBlueprintFile` is replaced by `planBlueprintFile`, which loads
`.pjt.ts` and runs every plan in the worker. Callers that held live blueprint objects should call
`planBlueprintFile` and pass its result to `buildPlan`.
