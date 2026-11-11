---
"@projitect/cli": minor
---

New `@projitect/blueprint-eslint` package. `eslint.config()` owns a flat `eslint.config.mjs` and the
`lint` / `lint:fix` scripts and devDependencies; `eslint.fix()` runs `eslint --fix .` as a
post-apply command and `eslint .` on `pjt inspect`.

Bootstrap with `config()` alone and install the declared dependencies before adding `fix()`.
Project-owned extension rules survive remodel and run in the generated module config.
