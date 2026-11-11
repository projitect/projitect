---
"@projitect/cli": major
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

**Migration for direct callers of `@projitect/cli-internals`:** `loadBlueprintFile` is removed.
`planBlueprintFile({ blueprintFile, projectRoot })` loads `.pjt.ts` and runs every plan in the
confined worker, returning the per-blueprint results (`id`, `version`, `permissions`,
`directoryPrefix`, `changeSet`) as plain data. Pass those results to the new
`buildPlanFromPlanned({ planned })`, which `build`, `remodel`, `inspect` and `explain` now use
instead of live blueprint objects. `buildPlan({ tree, projectRoot, layerFor })` stays for callers
that hold live blueprint objects and supply their own filesystem layer, such as the browser entry.
