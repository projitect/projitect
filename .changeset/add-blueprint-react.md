---
"projitect": minor
---

New `@projitect/blueprint-react` package. `react()` scaffolds a React + Vite + TypeScript app: it
composes the tsconfig, gitignore (`node` section) and vitest (jsdom) blueprints, owns
`vite.config.ts`, merges the `dev` / `build` / `preview` scripts and the React, Vite and testing
dependencies into `package.json`, adds `dist/` to `.gitignore`, and seeds the starter source
(`index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/index.css`) once, never
enforcing it afterwards.

New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.
