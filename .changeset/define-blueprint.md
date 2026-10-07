---
"projitect": minor
---

`@projitect/blueprint` adds `defineBlueprint` and `BlueprintDefinition<A>` — blueprint authors
declare their arguments as an Effect `Schema` instead of a hand-written TypeScript interface. The
argument type is inferred from the Schema's decoded type, and the returned definition is callable
with those arguments (`definition(args)`) so `.pjt.ts` files keep the same call shape whether a
blueprint is authored this way or as a bare factory function. `definition.id` and `definition.args`
are readable without calling it, for tooling that wants to introspect the Schema.

Calling a definition does not run Schema decoding — that's separate, forthcoming work. No shipped
blueprint migrates onto this in this change, and the `Blueprint` contract in `@projitect/core` is
unchanged.

New public SDK helper → **minor** per the AGENTS.md "Versioning (lockstep)" table.
