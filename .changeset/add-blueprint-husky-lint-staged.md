---
"projitect": minor
---

New `@projitect/blueprint-husky-lint-staged` package. `huskyLintStaged()` owns `.husky/pre-commit`
and merges the `lint-staged` field, the `prepare` script (`husky`) and the `husky` and
`lint-staged` devDependencies into `package.json`, with a `config` option that replaces the default
lint-staged config.

New blueprint package → **minor** per the AGENTS.md "Versioning (lockstep)" table.
