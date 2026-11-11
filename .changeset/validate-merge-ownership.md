---
"@projitect/cli": minor
---

Validate JSON merge ownership before anything is written. Two blueprints claiming a key and one of its descendants (`scripts` and `scripts.test`) now fail with `pjt.plan.conflict-merge` in either declaration order, judged on dotted-path segments. A merge blueprint that writes a field its `ownedKeys` do not cover fails with the new `pjt.plan.unowned-merge-write`. One blueprint declaring a key and its own descendant owns the ancestor. Removing a blueprint no longer deletes keys another blueprint still claims. Minor because it adds a public error id; plans that wrote unowned fields or overlapping keys previously passed and now fail.
