---
name: fp-utilities
description: projitect's FP mindset and utility-design guidance — Combiners and Reducers, where generic utilities live (effect, @nunofyobiz/effect-extras), designing a utility, and sort orders with Order. Use when writing data-manipulation logic, folds, merges or sorts.
---

# FP utilities and sort orders

## FP mindset

Compose logic from generic utilities that operate on generic data structures — don't write
complex functions with inline manipulation. Code declares _what_ to do; utilities handle _how_ to
manipulate the data.

### Spotting reuse opportunities

A `pipe()` chain is a structural declaration: each step names an operation on a named data shape.
Reading chains this way — and applying the same lens to any loop, `reduce`, imperative
accumulator, or complex conditional chain — is the primary way new utilities are discovered.
Before writing inline transformation logic, ask in order:

1. Does **Effect** already cover this? `Array`, `Option`, `Record`, `Predicate`, `String`,
   `Number`, `Order`, `Result`, `Match`, `Struct`, `Tuple`, `Combiner`, `Reducer`, `HashMap`,
   `HashSet`, etc. The Effect modules are wide and well-tested — most "manipulate this data shape"
   needs already exist there.
   When you're unsure what's available, check the [Effect docs](https://effect.website/).
2. Does a generic utility already exist in `@nunofyobiz/effect-extras`? Its `*X` modules
   (`StructX`, `RecordX`, `ArrayX`, `OptionX`, …) extend the corresponding Effect module with
   patterns we repeat — see [Where utilities live](#where-utilities-live).
3. Can the logic be expressed as a generic utility another call site could reuse?

If yes to any: use or extract it. The calling code stays focused on intent while the utility
handles the data manipulation.

**Extracting from a pipe.** When a cluster of 2–3 consecutive steps in a chain forms a
recognizable transformation, that cluster is a utility waiting to be named:

1. **Name it in the abstract** — strip the domain nouns and describe what the steps do to the data
   shape (e.g. "filter to present items, then group by key").
2. **Check Effect and `@nunofyobiz/effect-extras`** — does an equivalent already exist? If so,
   replace the cluster with it.
3. **If not, extract it** — implement a generic, `dual`-compatible function in the appropriate
   `*X` module, replace the inline steps with a single call, and add exhaustive tests.

This is how the utility layer grows: not by upfront design, but by recognizing structure that
already exists in a pipe and giving it a name.

> This is **not** in tension with the "we do not ship `sequence`/`when`/`unless` combinators" rule
> under [Effect v4 conventions](../effect-conventions/SKILL.md#effect-v4-conventions). That rule bans duplicating Effect's
> _control-flow_ combinators (Effect already has them). This section is about _data-shape_
> utilities — `ArrayX.categorize`, a compound `PredicateX`, a `StructX` field builder — which are
> encouraged, not banned.

### Combiners and Reducers — the universal merge/fold

When you're **combining N things into one** — merging config layers, concatenating outputs, folding
a list into a summary, picking a winner — reach for Effect's `Combiner` (a semigroup: "how do two
combine?") and `Reducer` (a monoid: a `Combiner` plus an identity, so you can fold a collection of
any length, including empty). They are the universal merge pattern, so you never hand-roll the fold.

Two wins follow:

1. **You don't reinvent the merge.** A reducer's `.combineAll(items)` method replaces a hand-rolled
   `items.reduce((acc, x) => …, seed)` — the combine logic is named once, in one place, and reused.
2. **It forces the data shape to fit the pattern.** Defining a `Reducer<A>` makes you answer "what
   is the identity?" and "how do two combine?", and answering those usually pushes the type toward
   something cleaner, shorter, and more adaptable. An identity element in particular turns "absent"
   into a no-op instead of a special case — no `filter(isPresent)` before folding.

The config cascade is the canonical example. `defaults → env → .pjt.ts → CLI args`, later wins, is
exactly a right-biased struct `Reducer` whose identity is the empty config `{}`:

```ts
import { Reducer } from "effect"

// later's defined keys win; `{}` is the identity (combining with it changes nothing)
export const Overrides: Reducer.Reducer<Partial<ProjitectConfig>> = Reducer.make<
  Partial<ProjitectConfig>
>((earlier, later) => ({ ...earlier, ...later }), {})

export const resolve = (...layers: readonly Partial<ProjitectConfig>[]): ProjitectConfig => ({
  ...defaults,
  ...Overrides.combineAll(layers),
})
```

Because `{}` is the identity, callers fold a missing layer as a no-op — `resolve(env ?? {},
blueprintFile ?? {}, cliArgs ?? {})` — with no pre-filtering. Check Effect's pre-built combiners
before writing `make`: `Combiner.last` / `first`, `Combiner.min` / `max`, `Combiner.intercalate`,
the `Order`-derived ones, and the per-module `*.Reducer` / `*.Combiner` instances.

A **domain type** can be the monoid too, not just config. `ChangeSet` (a blueprint's planned
operations) has an empty value and an associative `concat`, so it exports a `Reducer` — and composite
blueprints fold their parts with `combineAll` instead of hand-splicing `operations` arrays:

```ts
// in the ChangeSet module — `Reducer` is aliased because the module also exports `const Reducer`
import { Reducer as ReducerLib } from "effect"

export const empty: ChangeSet = { operations: [] }
export const concat = (self: ChangeSet, that: ChangeSet): ChangeSet => ({
  operations: [...self.operations, ...that.operations],
})
export const Reducer: ReducerLib.Reducer<ChangeSet> = ReducerLib.make(concat, empty)

// a composite blueprint (e.g. @projitect/blueprint-vitest) folds its parts:
const changeSets = yield * Effect.forEach(parts, (b) => b.plan)
return ChangeSet.Reducer.combineAll(changeSets) // not: push each .operations into an array
```

When a type has an identity and an associative combine, give it a `Reducer` on its own module — the
same move as the config cascade, applied to domain data.

### Where utilities live

- **`effect`** (the library) — the first place to look for generic data-manipulation primitives.
  If `Array.foo` already does what you want, use it directly.
- **`@nunofyobiz/effect-extras`** — the external home for projitect's generic `*X` utilities, a
  normal published dependency (peer: `effect@4.0.0-rc.111`, the exact version we pin). It is the
  `*X` suite adapted from StoryCut's `lib/*X` — `StructX`, `RecordX`, `ArrayX`, `OptionX`,
  `PredicateX`, `NonNullableX`, `StringX`, `ResultX`, `OrderX`, `SchemaX`, `WarnResult`, and more. Modules are
  PascalCase, imported as namespaces (`import { StructX } from "@nunofyobiz/effect-extras"`), and
  stay `node:*`-free. New generic utilities belong **here** — open a PR upstream rather than
  re-adding them locally.
- A utility used by only one package can start local to that package, then graduate to
  `@nunofyobiz/effect-extras` (open a PR upstream) once it's generic enough or a second package
  wants it. projitect keeps **no** in-repo `*X` package — every generic helper it once carried
  (`unsafeIsRecord`, the `RecordX` JSON-tree ops, the `StringX` line-editing helpers) now lives
  upstream.

### Check existing utilities first

`@nunofyobiz/effect-extras` ships a wide `*X` surface — check there before writing a new one:

| Module                                                                             | What it covers                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StructX`                                                                          | conditional object fields under `exactOptionalPropertyTypes` (`defined`, `filterDefined`, `some`, `truthy`)                                                      |
| `PredicateX`                                                                       | `isNonEmptyString`, `matchRefine`, `unsafeIsRecord` (the "is this a JSON object" guard — no `Predicate.isRecord` in v4)                                          |
| `NonNullableX`                                                                     | `match` (nullable/non-nullable branches), `map`, `lift`, `fromNullableOrThrow`, `nullableOrder`                                                                  |
| `RecordX`                                                                          | `collectBy`, `modifyIfExists`, `upsert`, `getOrThrow`, `keysAs`, `isNonEmptyRecord`; JSON trees: `deepMerge`, `deepMergeReducer`, `canonicalize`, `deleteByPath` |
| `StringX`                                                                          | `prepend`, `surround`, `ensurePrepend`, `replaceLineRange`, `insertBeforeLine`                                                                                   |
| `OrderX`                                                                           | `rankedEnum`                                                                                                                                                     |
| `WarnResult`                                                                       | inclusive-or result — a success value, warnings, or both (`SuccessOnly` / `WarningsOnly` / `SuccessWithWarnings`; `match`, `mapSuccess` / `mapWarnings`)         |
| `ArrayX`, `OptionX`, `ResultX`, `SchemaX`, `EffectX`, `MapX`, `SetX`, `NumberX`, … | the rest of the Effect-module extensions — browse the package                                                                                                    |

These all now live upstream — projitect carries no in-repo `*X` package.

### Illustrative patterns

These are the _shapes_ to reach for, named generically — not references to existing projitect code:

- **`categorize`** — group items by a classifier, instead of a loop that builds a
  `Record<string, T[]>`. The classifier is a `Match.type<T>().pipe(...)` returning a literal key.
- **`chunkBy`** — group _consecutive_ items by a key, instead of a manual loop tracking
  "current group" state.

When you find yourself writing either by hand, that's the signal to check Effect /
`@nunofyobiz/effect-extras` first and extract (or upstream) it if it's missing.

### Designing a good utility

1. **Generic type parameters** — operate on `<A>`, not concrete domain types.
2. **Pure functions** — no side effects, no mutations.
3. **Support `dual`** when the utility takes a data argument that could be piped (see
   [Effect patterns](../effect-conventions/SKILL.md#effect-patterns)).
4. **Follow the module/barrel pattern** — `*X` module file plus an `index.ts` namespace re-export.
5. **Exhaustive test coverage** — every public function, every branch, edge cases (empty,
   single-element, boundary), and type-level correctness where the utility's whole point is type
   narrowing. This is non-negotiable for generic utilities: they're consumed by every layer above,
   they have no domain context to specify them other than their tests, and they outlive the
   surrounding code.

The enforcement counterpart is [Reach for ESLint first](../../../docs/tooling.md#reach-for-eslint-first): when a utility
encodes an architectural rule, promote it to a lint rule so the wrong pattern can't be committed.

## Sort orders

Use Effect's `Order` module for type-safe, composable sorting — never an inline `Array.prototype.sort`
comparator.

### Named orders on the type's module

If an ordering is a logical property of a type — something other code will reuse, or that reads
better with a descriptive name — define it as a named export in that type's module.

```ts
import { Order } from "effect"

// e.g. in the Blueprint module: deterministic apply order
export const ApplyOrder: Order.Order<Blueprint> = Order.combine(
  Order.mapInput(Order.Number, (blueprint: Blueprint) => blueprint.priority),
  Order.mapInput(Order.String, (blueprint: Blueprint) => blueprint.id),
)

export const ApplyOrderDesc: Order.Order<Blueprint> = Order.flip(ApplyOrder)
```

**Naming convention:** PascalCase with a descriptive strategy name (`ApplyOrder`, `IdOrder`). Add an
`Asc`/`Desc` suffix only when both directions are exported as separate constants. As named orders
accrue, list them where they live; there are none yet.

### Sort inline for one-offs

For sorting specific to a single function and unlikely to be reused, sort inline without a named
constant:

```ts
const sorted = Array.sort(
  ops,
  Order.mapInput(Order.String, (op: ChangeSetOp) => op.path),
)
```

### Key helpers

| Helper                                    | Use case                                    |
| ----------------------------------------- | ------------------------------------------- |
| `Order.mapInput(baseOrder, extractField)` | Sort objects by a specific field            |
| `Order.combine(primary, secondary)`       | Multi-key sort (two orders)                 |
| `Order.combineAll([order1, order2, ...])` | Multi-key sort (more than two orders)       |
| `Order.flip(order)`                       | Flip ascending to descending                |
| `Array.sort(array, order)`                | Sort an array by a single order             |
| `Array.sortBy(order1, order2, ...)`       | Sort an array by multiple orders (combined) |

Specialized helpers — sorting enum-like values by explicit rank (`OrderX.rankedEnum`), or wrapping
an order to push nulls last (`NonNullableX.nullableOrder`) — come from `@nunofyobiz/effect-extras`;
import them rather than re-deriving inline.

### Composing and applying

```ts
// Reverse a field-derived order
export const NewestFirst: Order.Order<Snapshot> = Order.flip(
  Order.mapInput(Order.Date, (snapshot: Snapshot) => snapshot.takenAt),
)

// Apply
const sorted = Array.sort(snapshots, NewestFirst)
const multi = Array.sortBy(ApplyOrder, IdOrder)(blueprints)
```
