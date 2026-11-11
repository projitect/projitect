---
"@projitect/cli": minor
---

Add `@projitect/blueprint-prettier`. `prettier.config(options?)` owns `.prettierrc.json` and merges
a `format` script and a pinned `prettier` devDependency into `package.json`. `prettier.fix()`
runs `prettier --write` after `pjt build` and `pjt remodel`, and `pjt inspect` runs `prettier --check`
and reports a failure as drift.

The managed config is rendered by the same formatter version, preserving clean inspection with
nondefault formatting options. Invalid options report `pjt.prettier.invalid-options` before writes.
