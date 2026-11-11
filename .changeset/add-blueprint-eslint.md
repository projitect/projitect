---
"@projitect/cli": minor
---

New `@projitect/blueprint-eslint` package. `eslint.config()` owns a flat `eslint.config.mjs` and the
`lint` / `lint:fix` scripts and devDependencies; `eslint.fix()` runs `eslint --fix .` as a
post-apply command and `eslint .` on `pjt inspect`.
