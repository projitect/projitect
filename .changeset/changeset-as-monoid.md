---
"@projitect/cli": minor
---

`ChangeSet` is now a first-class monoid: it exports a `ChangeSet.Reducer` (identity `empty`,
associative `concat`) so composite blueprints can fold their parts with
`ChangeSet.Reducer.combineAll(changeSets)` instead of hand-concatenating operation arrays.
