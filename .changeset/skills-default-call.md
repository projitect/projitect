---
"@projitect/cli": patch
---

`pjt add @projitect/blueprint-skills` now splices a valid default call with a namespaced `id` and a `version`, so the next `pjt remodel` succeeds. A missing or invalid `id` or `version` fails with `pjt.skills.invalid-path` instead of a TypeError.
