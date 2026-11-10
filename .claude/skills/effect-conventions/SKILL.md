---
name: effect-conventions
description: projitect's Effect v4 coding conventions — Context.Service, Schema.TaggedError, Match over if/else, Predicate checks, dual, data-first vs pipe, Result, and the no-type-assertions rule. Use whenever you write or review Effect code in this repo.
---

# Effect conventions

## Effect v4 conventions

This codebase is **Effect-native**. We use the Effect v4 release candidate, pinned to the exact
`4.0.0-rc.111`.

- **Services** use the `Context.Service<Self, Shape>()("id")` base class — e.g. `BlueprintFileSystem`
  in `@projitect/core`. (There is no `ServiceMap` module in v4; `Context` is where `Service` lives.)
  The concrete implementation layer is built where the service is wired (`cli-internals` constructs a
  permission-gated `BlueprintFileSystem` per blueprint), not as a static `make` on the class. Do not
  use the v3 `Effect.Tag` proxy accessor pattern.
- **Plain function vs service vs combiner.** Reach for a service _last_: only when something needs
  dependency injection, a scoped lifetime, or layer-provided wiring (`BlueprintFileSystem` is the one
  example in this repo). A mergeable _value_ — config layers, ChangeSets — is a `Reducer` / `Combiner`
  (see [Combiners and Reducers](../fp-utilities/SKILL.md#combiners-and-reducers--the-universal-mergefold)); everything else —
  loader, planner, differ, applier, remover — is a plain Effect-returning function. Don't service-ify
  pure logic.
- **Errors** use `Schema.TaggedError` (not `Data.TaggedError`) so they serialize cleanly to JSON
  for `pjt inspect --json`. Every error declares a semantic `id` field
  (`pjt.<subsystem>.<kebab-case>`) and has a matching MDX page in `apps/website`.
- **Layer composition** memoizes across `Effect.provide` calls by default in v4. Opt out with
  `{ local: true }` only when you have a specific reason.
- **Control flow** uses pattern matching, not `if/else` chains — see [Effect patterns](#effect-patterns) for the full set of conventions (Match, predicates, `dual`, data-first vs `pipe`, `Result`).
- **Conditional construction** uses `Effect.when`, `Effect.forEach`, `Effect.all`, and `Match` for
  branching. We do not ship our own sequencing/conditional blueprint combinators because Effect
  already has them. (This bans duplicating Effect's _control-flow_ combinators; generic _data-shape_
  utilities are a separate matter — see [FP mindset](../fp-utilities/SKILL.md#fp-mindset).)
- **Schema** v4 uses `.check(Schema.isInt(), Schema.isGreaterThan(0))` not
  `.pipe(Schema.int(), Schema.positive())`. Mind the migration on snippets copied from older docs.

## Effect patterns

This codebase has specific conventions for _how_ to write Effect code. They keep code consistent
across packages and lean on Effect's type system for safety. Apply them on every change that
touches Effect, not just net-new files.

### Match over if/else

Use `Match.value` or `Match.valueTags` / `Match.tagsExhaustive` instead of `if/else` chains or
`switch`. The compiler enforces exhaustiveness — when a new ownership mode or ChangeSet op kind
lands, every match site fails to compile until it handles the new case.

```ts
import { Match } from "effect"

// Discriminated unions — exhaustive over the tag
const summary = Match.value(op).pipe(
  Match.tag("Region", (region) => `region ${region.ownerId}`),
  Match.tag("Merge", (merge) => `merge ${merge.path}`),
  Match.tag("Owned", (owned) => `owned ${owned.path}`),
  Match.tag("Seed", (seed) => `seed ${seed.path}`),
  Match.exhaustive,
)

// Tagged errors — Match.valueTags maps each tag in one shot
const message = Match.valueTags(error, {
  FsPermissionDenied: (denied) => `permission denied: ${denied.glob}`,
  PlanConflict: (conflict) => `conflicting owners for ${conflict.path}`,
})

// Plain values
const exitCode = Match.value(status).pipe(
  Match.when("clean", () => 0),
  Match.when("drift", () => 1),
  Match.exhaustive,
)
```

For the success/failure split on an Effect, `Effect.matchEffect` (already used in
`cli-internals`' command dispatchers) is the Effect-level equivalent. Short ternaries and `??`
are fine: `const name = config.name ?? "unnamed"`.

### Predicates for type checks

Use predicates from Effect modules instead of manual `=== null`, `typeof`, or `.length > 0`
checks.

```ts
import { Predicate, String, Number, Array } from "effect"

if (Predicate.isNotNullish(value)) { ... }    // instead of: value != null
if (Predicate.isString(value)) { ... }        // instead of: typeof value === "string"
if (String.isNonEmpty(str)) { ... }           // instead of: str.length > 0
if (Array.isArrayNonEmpty(arr)) { ... }       // instead of: arr.length > 0
```

A compound predicate worth reusing (e.g. `isNonEmptyString`, which combines `isNotNullish`,
`isString`, and `String.isNonEmpty`) lives in `@nunofyobiz/effect-extras`'s `PredicateX` — import
it from there rather than re-deriving it. See [FP mindset](../fp-utilities/SKILL.md#fp-mindset) for the full hierarchy of
where utilities live.

### Dual functions

When a function supports both piped and direct call styles, use `dual` imported from
`effect/Function` (not `Function.dual()`). List the **data-last** (piped) overload first, then
the **data-first** overload:

```ts
import { dual } from "effect/Function"

export const withPrefix = dual<
  // Data-last (for piping): pipe(id, withPrefix("pjt:"))
  (prefix: string) => (id: string) => string,
  // Data-first (direct call): withPrefix(id, "pjt:")
  (id: string, prefix: string) => string
>(
  2, // arity of the data-first overload
  (id, prefix) => `${prefix}${id}`,
)
```

### Data-first vs `pipe`

Prefer **data-first** style for single function calls. Use `pipe()` only when chaining 2+
operations.

```ts
// Good — data-first for single calls
Option.getOrElse(option, () => fallback)
Effect.map(effect, fn)

// Good — pipe for chains of 2+
pipe(
  option,
  Option.filter(predicate),
  Option.getOrElse(() => fallback),
)

// Bad — pipe wrapping a single call
pipe(
  option,
  Option.getOrElse(() => fallback),
)

// Good — pass a curried function directly (no wrapper lambda)
Option.flatMap(option, Schema.decodeUnknownOption(BlueprintId))

// Bad — unnecessary anonymous lambda wrapping a single function call
Option.flatMap(option, (value) => Schema.decodeUnknownOption(BlueprintId)(value))
```

### `Result` over custom discriminated unions

When a function returns "success or one of N failure reasons", reach for `Result<A, E>` instead
of hand-rolling a discriminated union. This unlocks Effect's standard combinators (`Result.map`,
`Result.match`, `Result.getOrElse`) instead of manual `_tag` checks — a natural fit for the
planner/differ, where a step is either a clean ChangeSet or a typed reason it can't be computed.

**Use `Result` when:** a function returns success or one of several failure modes; the success
case carries data you want to transform; the failure cases are finite and tagged. **A custom
union is fine when:** 3+ variants are all "equal" with no clear success/failure split.

Pattern: `Result.match` with `onSuccess` first (the success path is what readers care about),
and `Match.type<E>().pipe(...)` in `onFailure` for exhaustive tag matching without a wrapping
arrow function.

```ts
import { Result, Match } from "effect"

Result.match(planResult, {
  onSuccess: (changeSet) => render(changeSet),
  onFailure: Match.type<PlanConflict | FsPermissionDenied>().pipe(
    Match.tag("PlanConflict", (conflict) => reportConflict(conflict)),
    Match.tag("FsPermissionDenied", (denied) => reportDenied(denied)),
    Match.exhaustive,
  ),
})
```

> v4 renamed `Either` → `Result`. The constructor names also changed: `Either.right(x)` is now
> `Result.succeed(x)` and `Either.left(e)` is now `Result.fail(e)` (with `Result.failVoid` for the
> no-payload case). There is no `Either` alias.

### Quick reference

| Instead of                        | Use                                      |
| --------------------------------- | ---------------------------------------- |
| `if/else` chains                  | `Match.value` / `Match.valueTags`        |
| `=== null`                        | `Predicate.isNull`                       |
| `!= null`                         | `Predicate.isNotNullish`                 |
| `=== undefined`                   | `Predicate.isUndefined`                  |
| `str.length > 0`                  | `String.isNonEmpty(str)`                 |
| `arr.length > 0`                  | `Array.isArrayNonEmpty(arr)`             |
| `{ key: maybeUndefined }`         | `StructX.defined("key", maybeUndefined)` |
| Custom `_tag` discriminated union | `Result<A, E>` + `Result.match`          |

> `tsconfig.base.json` sets `exactOptionalPropertyTypes: true` (required by Effect Schema), so
> spreading `{ key: undefined }` into an object whose key is `key?: T` is a type error — the
> property must be _absent_, not present-but-undefined. `@nunofyobiz/effect-extras`'s `StructX`
> (conditional object-field construction: `defined`, `filterDefined`, `some`, `truthy`) is the
> canonical fix — `StructX.defined("key", maybeUndefined)` yields `{}` or `{ key: value }`. See
> [FP mindset](../fp-utilities/SKILL.md#fp-mindset).

## No type assertions

Avoid the `as` keyword (outside of `as const` and `satisfies`). There is no blanket lint ban —
the `strict` type-checked preset's `@typescript-eslint/no-unnecessary-type-assertion` and
`no-non-null-assertion` catch the redundant cases, and code review catches the rest. When you
reach for a cast, the right answer is usually one of:

- `Schema.decode*(...)` / `Schema.is(...)` — for runtime-validated narrowing
- `Match.value(...)` with exhaustive cases — for discriminated unions
- A `Predicate.is*` refinement (or a `PredicateX` helper) — for type guards
- A return-type annotation or `satisfies` — when you just need to pin a literal's type

If none of those work, that's a sign the shape is wrong. The one sanctioned exception is the
generic type-manipulation inside the `*X` utilities (in `@nunofyobiz/effect-extras`), where a
contained cast at the boundary is sometimes unavoidable.
