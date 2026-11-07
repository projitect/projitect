---
"projitect": minor
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
