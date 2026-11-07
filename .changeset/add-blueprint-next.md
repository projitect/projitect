---
"projitect": minor
---

New `@projitect/blueprint-next` package. `next()` scaffolds a Next.js (App Router) + TypeScript
app: it composes the tsconfig, gitignore (`node`, `next` and `tsbuildinfo` sections) and vitest
(jsdom) blueprints, owns `next.config.ts`, merges the `dev` / `build` / `start` / `lint` scripts and
the Next.js, React, ESLint and testing dependencies into `package.json`, and seeds the starter
source (`src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/page.test.tsx`)
and an `eslint.config.mjs` that extends `eslint-config-next` once, never enforcing them afterwards.
The supported Next.js and React ranges are declared in the package manifest under
`projitect.supports`.

New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.
