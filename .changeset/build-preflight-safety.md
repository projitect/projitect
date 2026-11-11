---
"@projitect/cli": minor
---

Validate imported configuration before destructive builds delete files, and require explicit --yes authorization on non-interactive input with pjt.apply.confirmation-required. Blueprint Effects still evaluate after deletion to retain fresh-build semantics.
