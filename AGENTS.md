# projitect — agent guide

`CLAUDE.md` is a symlink to this file. Source of truth.

When you update this file, **rewrite the affected section cohesively** — do not append patches to
the bottom. The next reader (human or agent) should be able to scan the section top-to-bottom and
understand it without archaeology.

---

## What this repo is

`projitect` is a project-scaffolding tool — Terraform for frontend projects. The user-facing
binary is `pjt`. Project maintainers declare a list of **blueprints** in `.pjt.ts`; `pjt build`
materializes them, `pjt remodel` updates the project to match, and `pjt inspect` reports drift
with a nonzero exit for CI.

This is a **pnpm monorepo** with five library packages, one binary package, and a marketing
site. All published packages version in **lockstep** via changesets — one shared version, matching
Effect v4's own release model.

## Package manager

**pnpm only.** Never npm, never yarn, never bun in this repo. The lockfile is `pnpm-lock.yaml`.

If `pnpm` is not found, escalate in this exact order — do not chain them:

1. Run the command as-is. If it works, stop.
2. Run `nvm use` (reads `.nvmrc`). Try again.
3. Run `source ~/.nvm/nvm.sh && nvm use`. Try again.
4. Only if all three fail, ask the user.

Do **not** prepend `cd /path/to/repo` to pnpm commands — pnpm respects the current working
directory. Chaining `cd && pnpm` triggers permission prompts unnecessarily.

## Permission-prompt posture (command shape)

Most permission prompts are a **command-shape problem, not a missing allowlist entry** — the engine
auto-approves a command only when _every_ part of it is independently safe, so several wrappers defeat
an otherwise-allowlisted command. The allowlist in [`.claude/settings.json`](./.claude/settings.json)
covers the safe reads and routine scripts; you keep prompts low by _how_ you invoke things:

- **Prefer the built-in `Grep` / `Glob` / `Read` tools** over shell `grep` / `git grep` / `find` /
  `cat` / `sed` / `head` and pipelines. They don't go through the Bash permission path, so they never
  prompt — and they're faster. Concretely:
  - `sed -n 'A,Bp' file` / `head -n N file` → `Read` with `offset` / `limit`.
  - `grep … file` / `git grep …` → the `Grep` tool. Scope with `glob` (e.g. `**/*.ts`) and exclude
    tests with a negated glob (`!**/*.test.*`) instead of a `| grep -v` pipe.
  - **Reading or searching N files → one `Grep`/`Read`, never a `for f in …; do grep …; done` loop.**
  - Drop `echo "=== … ==="` section separators and `|| echo "no matches"` fallbacks entirely — the
    native tools label their output and report empty results for free. A stray `echo` is enough to
    force a prompt on an otherwise-allowlisted block.
- **One command per tool call — never `&&` / `;` / `|` / `$(…)` chains or `for`/`while` loops.** A
  compound line is auto-approved only if every segment independently clears, so even an all-allowlisted
  chain (`git add … && git commit … && git log …`) prompts. Run the steps as separate calls. Loops and
  command substitution prompt structurally — that gate is intentional, so reach for the native tools
  above instead of trying to allowlist your way around it.
- **Run project scripts verbatim** — `pnpm tc` / `pnpm test` / `pnpm lint` / `pnpm check-all`, with no
  env-var prefix (`TMPDIR=…`), no extra flags, and no `2>&1 | tail` / `2>/dev/null` capture wrapper. Run
  them bare and read the output; the redirect/pipe is itself what prompts.
- **Commit with `-m` (or `-F <file>`), never a heredoc.** `git commit <<'EOF' … EOF` is an input
  redirect and prompts on _every_ commit.
- **Don't `cd` / `git -C <path>` into the worktree you're already in** — an out-of-cwd path triggers a
  prompt. The cwd already _is_ the repo; run `git status`, `pnpm test`, etc. directly.

Consequential actions stay **deliberately gated** (they _should_ prompt): inline code runners
(`node -e`, `tsx -e`, `npx -e`), `gh pr merge`, `gh issue create`, publishes (`changeset publish`), and
destructive git (`git reset --hard`, `git clean -fd`, bare `git push --force`). To probe a library's
runtime behavior, write a throwaway test and run it with the allowlisted `pnpm test` instead of an inline
`-e` eval. Expanding the allowlist is the smallest lever, not the first — fix the root cause in scripts or
command shape before reaching for it. (This is the static-enforcement reflex from
[Reach for ESLint first](#reach-for-eslint-first) applied to the permission layer.)

## Node version

Pinned in `.nvmrc` to **22.12.0**. The published `engines.node` is `>=22.12.0`. We rely on Node
23.6+ for native TypeScript strip-types in user `.pjt.ts` files, with `tsx` as a fallback for
22.x users. Do not raise the floor without an open discussion.

## Verification ritual

Before claiming a task done, run **`pnpm check-all`** from the repo root. It runs, in order:

1. `pnpm tc` — `tsc --build` across all project references
2. `pnpm lint` — ESLint flat config (covers code style + Prettier formatting via `eslint-plugin-prettier`; no separate `format:check` step)
3. `pnpm test` — Vitest (unit + integration with the in-memory `BlueprintFileSystem`)
4. `pnpm knip` — unused exports

If you only changed one package, you can run the same checks scoped: `pnpm --filter <pkg> tc`,
etc. — but `check-all` is the gate before merging.

Three additional checks run in CI but are also runnable locally:

- `pnpm --filter website check:examples` — every code snippet under `apps/website/examples/`
  typechecks. Marketing copy is not allowed to lie.
- `pnpm --filter website check:errors` — every error id exported by `@projitect/core` has a
  matching MDX page under `apps/website/src/content/docs/errors/`.
- `./scripts/smoke.sh` — end-to-end smoke covering init → add → remodel → inspect → lockfile
  orphan removal → build --force in a throwaway `/tmp` project. Heaviest gate; run when you've
  touched the CLI pipeline.

## ESLint absorbs Prettier

One tool, one config, one command. Adapted from StoryCut's and effect-clue's flat configs:

- `eslint-plugin-prettier/recommended` runs Prettier as an ESLint rule. Formatting drift surfaces as a `prettier/prettier` lint error — no separate `prettier --check` step.
- For files ESLint doesn't parse (MDX, YAML, JSON5, CSS) the `pnpm format` script invokes Prettier directly. `lint-staged` covers them automatically on commit.
- The rule set is ported from StoryCut's: `typescript-eslint` **strict + stylistic** type-checked presets, `unicorn`'s **`flat/all`** preset, `eslint-plugin-import` (syntactic rules only — the resolver-backed ones are redundant with tsc), and StoryCut's core-quality rules (`eqeqeq`, `no-else-return`, `prefer-template`, `strict-boolean-expressions`, …). Each comes with a small list of overrides for rules that clash with Effect-heavy code (`unicorn/no-null`, `no-array-reduce`, `prefer-json-parse-buffer`, etc.) or with NodeNext resolution (`import/no-useless-path-segments` is omitted — it strips the `/index.js` NodeNext requires). See [eslint.config.js](./eslint.config.js) for the canonical list with rationale.
- `eslint-plugin-package-json` validates every `package.json` in the monorepo: required fields, npm-standard property order, alphabetized dependencies. Catches "would-publish-but-broken" mistakes alongside the `publish-dry-run` CI job.
- Filenames are kebab-case (`unicorn/filename-case`) — uniformly, now that the PascalCase `*X` utility modules live in the external `@nunofyobiz/effect-extras` rather than in this repo.

Per-package sandbox enforcement at lint time (the "soft" half of the soft sandbox):

| Files                                              | Banned imports                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/blueprint/**`, `packages/blueprint-*/**` | `@effect/platform`'s `FileSystem`, all `node:*` — blueprints must go through `BlueprintFileSystem`      |
| `packages/core/**`                                 | All `node:*` — core stays runtime-pure so it can run in a browser (planned interactive in-browser demo) |
| `packages/test-kit/**`                             | All `node:*` — test-kit is an in-memory FS by definition; touching the disk would defeat its purpose    |

`pnpm lint` is the single command. `pnpm lint:fix` applies autofixes. CI runs `pnpm lint`; no `format-check` job.

## Reach for ESLint first

Whenever you introduce a new dep, library, framework, or architectural rule — or notice a class
of bug that "should have been caught automatically" — **check whether an ESLint plugin (or a
hand-written `no-restricted-imports` / `no-restricted-syntax` rule) can enforce the constraint
mechanically**. This is a default reflex, not an after-the-fact polish.

Static linting is the cheapest enforcement layer in the stack. It runs on every save (IDE), every
commit (`lint-staged`), and every CI run. Promoting a rule from code review or docs up to lint
multiplies its leverage:

- **Code review** catches the issue once, for the patient reviewer who notices.
- **Docs** hope the next author reads them.
- **ESLint** stops the wrong pattern from ever being committed.

### Triggers — always ask "is there a plugin or rule for this?"

| Trigger                                                                                                                 | Lookup                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding a new npm dep                                                                                                    | Search `npm` for `eslint-plugin-<name>` and read the dep's own README. Most popular libraries ship one (React, Tailwind, Vitest, Astro, Next, etc.).                               |
| Adding a new framework or runtime                                                                                       | Check the framework's recommended ESLint preset. Bring it in even if you only need a subset of rules — drop the rest with overrides.                                               |
| Introducing an architectural rule (e.g. "blueprints can't import `@effect/platform`'s `FileSystem`", "core stays pure") | Hand-roll a `no-restricted-imports` / `no-restricted-syntax` rule, scoped via `files:` to the relevant directories. See the per-package sandbox bans above for canonical examples. |
| A code-review finding that turns out to be a class of bug, not a one-off                                                | Find or write a lint rule **before** the PR merges. The cost is one-time; the saving compounds.                                                                                    |
| A `tsc --build` diagnostic the Effect LS surfaces repeatedly                                                            | The diagnostic itself is the rule — fix the violation, and the patch is doing its job. (If it surfaces a recurring pattern, also note it in this file.)                            |

If no plugin or rule fits your case, leave a one-line note in the PR description so the next dep
upgrade or refactor pass can revisit. Don't silently absorb the constraint into "team lore."

## Effect language service

The package's `prepare` script runs `effect-language-service patch` on every `pnpm install`. This patches the local `node_modules/typescript` so that **`tsc --build` produces Effect-specific diagnostics in addition to the standard TS checks** — things like `yield* Effect.fail(new X())` being flagged as redundant (since `new X()` is itself yieldable for `Schema.TaggedErrorClass` errors), `Effect.sync` thunks accidentally returning a Promise, missing Effect requirements, etc.

If you delete `.tsbuildinfo` files or wipe `node_modules` and the patch doesn't seem to be applied, run `pnpm install` to re-fire `prepare`. `pnpm effect-language-service check` verifies the patch state.

The `tsconfig.base.json`'s `"plugins": [{ "name": "@effect/language-service" }]` covers the editor / LSP side. The `patch` covers the build / CLI side. Both should be active.

## Pre-commit hooks (husky + lint-staged)

Configured via the root [`package.json`](./package.json)'s `lint-staged` field and
[`.husky/pre-commit`](./.husky/pre-commit).

- JS / TS files: `eslint --fix --max-warnings=0` — runs ESLint with the prettier integration, fixes what it can, fails the commit on any remaining issue.
- MDX / YAML / JSON5 / CSS files: `prettier --write`.

Husky is bootstrapped via the `prepare` script — `pnpm install` triggers `husky` which creates `.husky/_/` for the runner shims. The actual hook (`pre-commit`) is committed.

When a commit is blocked: read the lint-staged output, fix the surfaced errors, and re-stage. Don't `git commit --no-verify` to bypass — `--no-verify` is forbidden by the "no destructive shortcuts" rule below.

## CI (GitHub Actions)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) defines one job per check. All ten jobs
run in parallel on every PR and every push to `main`. Concurrency group cancels in-progress
runs on new pushes to the same ref. Default Node version is sourced from `.nvmrc` (22.12);
behavioral jobs run a 22 + 24 matrix.

| Job               | Matrix       | What it runs                                                                        |
| ----------------- | ------------ | ----------------------------------------------------------------------------------- |
| `typecheck`       | node 22 / 24 | `pnpm tc`                                                                           |
| `lint`            | (.nvmrc)     | `pnpm lint` (code style + Prettier formatting via `eslint-plugin-prettier`)         |
| `test`            | node 22 / 24 | `pnpm test` (Vitest unit suites; `needs: build-packages`)                           |
| `knip`            | (.nvmrc)     | `pnpm knip`                                                                         |
| `build-packages`  | (.nvmrc)     | `pnpm build` — uploads `packages/*/dist/` as a build artifact                       |
| `build-website`   | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website build`                    |
| `check-errors`    | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website check:errors`             |
| `check-examples`  | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website check:examples`           |
| `smoke`           | node 22 / 24 | downloads the build artifact, then `./scripts/smoke.sh`                             |
| `publish-dry-run` | (.nvmrc)     | `pnpm -r --filter './packages/*' publish --dry-run --no-git-checks --access public` |

Only `typecheck`, `test`, and `smoke` get the 22 + 24 matrix. Those three are the ones whose
outcome can genuinely depend on Node version (TS strip-types behavior, Node API additions /
removals between majors, smoke-script `node` invocations). `lint` / `knip` / `build-packages`
have no Node-version-dependent behavior worth matrixing — they run on the .nvmrc default.

The setup action at `.github/actions/setup/action.yml` accepts an optional `node-version`
input; matrixed jobs pass `${{ matrix.node }}`, others omit it and fall through to .nvmrc.

Total wall-clock ≈ 60-90s (bounded by `smoke`). If a check passes locally but fails in CI,
prefer "fix the workflow's pnpm-store cache" or "fix the underlying determinism" — never `if:`
the check off.

Snapshot npm publishes on PR branches are a tracked follow-up.

## Effect v4 conventions

This codebase is **Effect-native**. We use `effect@beta`, pinned to the exact `4.0.0-beta.74`.

- **Services** use the `Context.Service<Self, Shape>()("id")` base class — e.g. `BlueprintFileSystem`
  in `@projitect/core`. (There is no `ServiceMap` module in v4; `Context` is where `Service` lives.)
  The concrete implementation layer is built where the service is wired (`cli-internals` constructs a
  permission-gated `BlueprintFileSystem` per blueprint), not as a static `make` on the class. Do not
  use the v3 `Effect.Tag` proxy accessor pattern.
- **Plain function vs service vs combiner.** Reach for a service _last_: only when something needs
  dependency injection, a scoped lifetime, or layer-provided wiring (`BlueprintFileSystem` is the one
  example in this repo). A mergeable _value_ — config layers, ChangeSets — is a `Reducer` / `Combiner`
  (see [Combiners and Reducers](#combiners-and-reducers--the-universal-mergefold)); everything else —
  loader, planner, differ, applier, remover — is a plain Effect-returning function. Don't service-ify
  pure logic.
- **Errors** use `Schema.TaggedErrorClass` (not `Data.TaggedError`) so they serialize cleanly to JSON
  for `pjt inspect --json`. Every error declares a semantic `id` field
  (`pjt.<subsystem>.<kebab-case>`) and has a matching MDX page in `apps/website`.
- **Layer composition** memoizes across `Effect.provide` calls by default in v4. Opt out with
  `{ local: true }` only when you have a specific reason.
- **Control flow** uses pattern matching, not `if/else` chains — see [Effect patterns](#effect-patterns) for the full set of conventions (Match, predicates, `dual`, data-first vs `pipe`, `Result`).
- **Conditional construction** uses `Effect.when`, `Effect.forEach`, `Effect.all`, and `Match` for
  branching. We do not ship our own sequencing/conditional blueprint combinators because Effect
  already has them. (This bans duplicating Effect's _control-flow_ combinators; generic _data-shape_
  utilities are a separate matter — see [FP mindset](#fp-mindset).)
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
it from there rather than re-deriving it. See [FP mindset](#fp-mindset) for the full hierarchy of
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
> [FP mindset](#fp-mindset).

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
> under [Effect v4 conventions](#effect-v4-conventions). That rule bans duplicating Effect's
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
  normal published dependency (peer: `effect@4.0.0-beta.74`, the exact version we pin). It is the
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
   [Effect patterns](#effect-patterns)).
4. **Follow the module/barrel pattern** — `*X` module file plus an `index.ts` namespace re-export.
5. **Exhaustive test coverage** — every public function, every branch, edge cases (empty,
   single-element, boundary), and type-level correctness where the utility's whole point is type
   narrowing. This is non-negotiable for generic utilities: they're consumed by every layer above,
   they have no domain context to specify them other than their tests, and they outlive the
   surrounding code.

The enforcement counterpart is [Reach for ESLint first](#reach-for-eslint-first): when a utility
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

## Blueprint authoring rules

Packages under `packages/blueprint*/` **must not** import `FileSystem` from `@effect/platform`.
ESLint enforces this. Blueprints use the `BlueprintFileSystem` service from
`@projitect/blueprint`, which wraps the real FS behind a `Permission`-gated interface.

This is our soft sandbox: blueprints declare what they need (`{ kind: "write", glob: "..." }`)
and `cli-internals` enforces the bounds at the Effect layer. A worker-process sandbox is a
tracked follow-up; the interface is designed to swap transparently when we ship it.

## Region marker convention

Region-owned file operations use comment-fenced markers. Two shapes:

**Single-prefix** (`#`, `//`, `--`, `;`, etc.) — marker terminates at end-of-line:

```
<comment-prefix> pjt:<owner-id> start
... content ...
<comment-prefix> pjt:<owner-id> end
```

**Prefix + suffix pair** (HTML/MDX/XML) — marker needs a closing delimiter:

```
<comment-prefix> pjt:<owner-id> start<comment-suffix>
... content ...
<comment-prefix> pjt:<owner-id> end<comment-suffix>
```

Comment style by file:

| File                                                          | Prefix | Suffix |
| ------------------------------------------------------------- | ------ | ------ |
| `.gitignore`, `.eslintignore`, `.prettierignore`, YAML, shell | `#`    | (none) |
| JS/TS/JSON5                                                   | `//`   | (none) |
| HTML, MDX, XML, `README.md`, `AGENTS.md`                      | `<!--` | ` -->` |

The `@projitect/blueprint` SDK ships two helpers that bake in the right pair so authors
don't have to remember them: `ignoreSection({ ... })` for `#`-comment files, `markdownSection({ ... })`
for HTML/MDX. Reach for those before dropping down to `regionFile({ commentPrefix, commentSuffix, ... })`.

`owner-id` is the string the blueprint puts in its `id` field, e.g. `pjt:gitignore:macos`. Two
blueprints attempting to own the same region in the same file is a `pjt.plan.conflict` error.

## File ownership modes

Every blueprint operation declares one of four modes:

| Mode     | When to use                                                                            |
| -------- | -------------------------------------------------------------------------------------- |
| `region` | Text file, multiple blueprints can coexist (e.g., `.gitignore`)                        |
| `merge`  | Structured JSON, blueprint owns specific keys (e.g., `package.json`)                   |
| `owned`  | Generated file, single blueprint owns whole content (e.g., generated TypeScript types) |
| `seed`   | Write-once, never enforced after (e.g., initial `.pjt.ts` content)                     |

See `docs/concepts/ownership-modes` on the marketing site for examples.

## Error catalog

Errors live in `packages/core/src/errors/`. To add a new one:

1. Define a new `Schema.TaggedErrorClass` class with an `id` field
2. Export it from `packages/core/src/errors/index.ts`
3. Add `apps/website/src/content/docs/errors/<id>.mdx` with **What**, **Why**, **How to fix**
4. `pnpm --filter website check:errors` will catch step 3 if you forget

Use the `new-error-code` skill in `.claude/skills/` to scaffold all three at once.

## Kanban workflow

Day-to-day work on this repo flows through a Trello board. Cards capture ideas, get refined
into a prioritized backlog, then move through an implementation pipeline with a human
approval gate at every transition. The kanban workflow is **optional** — contributors who
don't configure it work on this repo exactly as before. Contributors who do configure it
get the `/kanban-*` skills as their primary interaction surface with Claude Code on this
project.

The full setup walkthrough is at [.claude/skills/kanban/SETUP.md](.claude/skills/kanban/SETUP.md);
the canonical reference for the board layout, transition rules, signed-comment format, and
board-scope guard is [.claude/skills/kanban/shared.md](.claude/skills/kanban/shared.md). The
skill bundle is adapted from
[cyanluna-git/cyanluna.skills](https://github.com/cyanluna-git/cyanluna.skills), substituting
Trello for that project's hosted Postgres board.

### Board layout — 8 columns

```
Brain Dump → Backlog → Plan → Plan Review → Impl → Impl Review → Test → Done
```

Brain Dump is the inbox — humans and agents drop raw ideas here without ceremony. Triage
moves them into Backlog with priority labels. The remaining six columns are the
implementation pipeline.

### Skills

| Skill                | What it does                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| `/kanban-init`       | One-time per-repo bootstrap. Creates lists + labels, writes `.claude/kanban.json`.  |
| `/kanban-dump`       | Fast capture to Brain Dump. Title + optional body, no follow-up questions.          |
| `/kanban-triage`     | Walk Brain Dump cards: promote, merge, refine, or archive.                          |
| `/kanban-prioritize` | Re-rank Backlog with a scoring sketch the human overrides as needed.                |
| `/kanban-refine`     | Flesh out a card's Summary, Acceptance criteria, Dependencies, Level (L1/L2/L3).    |
| `/kanban-run`        | Full pipeline orchestrator — Backlog → Done, with a human gate at every transition. |
| `/kanban`            | Foundation — primitive CRUD (list, show, add, comment, move) used by the others.    |

Pairs naturally with [`/grill-me`](.claude/skills/grill-me/SKILL.md) — an adversarial
interviewer that stress-tests a half-formed thought one question at a time, then proposes
the `/kanban-dump` for you. Use it whenever you'd otherwise put a fuzzy idea on the board
without thinking it through.

### Daily workflows

Common patterns — capture, triage, refine, run, watch — are walked end-to-end in
[`docs/kanban/workflows.md`](docs/kanban/workflows.md). Read it once when you adopt the
workflow; come back when a new situation comes up that you're not sure how to handle. From
inside Claude Code, `/kanban-help` is the interactive version — it asks what you want to do
and prints the matching recipe.

### Human-in-the-loop at every step

Every column transition fires `AskUserQuestion` first. There is no `--auto` mode. At each
gate the human can:

- **Approve** — move forward
- **Reject (stay)** — keep card in current column, comment trail records why
- **Roll back** — move to a prior column with a comment explaining what's wrong

Every mutation leaves a signed comment in the format
`> **<Actor>** · <model-or-"human"> · <ISO timestamp>` followed by the body. The card
description holds the canonical artifact (plan, implementation summary, test results);
comments are the audit trail. After three consecutive rejections at Plan Review or Impl
Review, the orchestrator hard-stops and asks the user to intervene — cyanluna's circuit
breaker, kept verbatim.

### Setup, in one paragraph

Create a Trello board; generate an API key via a Power-Up at
<https://trello.com/power-ups/admin> and a token via the `/1/authorize` URL; copy
`.env.local.example` → `.env.local` and fill in `TRELLO_API_KEY`, `TRELLO_TOKEN`,
`TRELLO_BOARD_ID`; restart Claude Code so `.mcp.json` picks up the env; run `/kanban-init`.
The MCP server is launched via `pnpm dlx @delorenj/mcp-server-trello` — no new runtime to
install. Total time ~10 minutes the first time. If any prereq is missing, every kanban skill
bails on first invocation with a pointer back to `SETUP.md`.

Per-user board overrides live in `.claude/kanban.local.json` (gitignored). Secrets live in
`.env.local` (gitignored). The committed `.claude/kanban.json` holds the board id and the
list ids that teammates share.

### Trello tokens are account-wide — board scoping is defense-in-depth

Trello has no native "single-board" token. The MCP server (`@delorenj/mcp-server-trello`)
enforces a board scope via `TRELLO_BOARD_ID`, and every `kanban-*` skill verifies the target
card's `idBoard` matches before mutating (the "board-scope guard" in `shared.md`). For a
stronger boundary, create a dedicated Trello service account that's only invited to the
projitect board, and generate the API key + token from that account.

### Scope: contributor tooling, not a product feature

Changes to the kanban skill bundle (`.claude/skills/kanban*/`) and the supporting files
(`.mcp.json`, `.env.local.example`, `.claude/skills/kanban/bin/launch-trello-mcp.sh`,
`.claude/kanban.json`) are **contributor tooling** — they don't affect the published
projitect packages or the marketing site. The
[Marketing site coordination](#marketing-site-coordination-at-every-phase) and
[Versioning (lockstep)](#versioning-lockstep) rules do not apply to changes in the kanban
bundle.

## Commits and PRs

- Conventional Commits enforced by commitlint
- One concept per commit; squash trivial fixups locally before opening a PR
- PR merge style: merge commit (never squash) — preserves the conventional commit history
- Run `pnpm check-all` before pushing
- When a card from the kanban workflow shipped: include `[kanban #<CARD_ID>]` in the commit
  subject (e.g. `feat(cli): add --json to pjt inspect [kanban #42]`). The orchestrator
  prompts you for this on the final approval gate — see
  [Kanban workflow](#kanban-workflow).

### Commit signing

**Every commit in this repo is signed** with a dedicated "Claude Code" SSH key, so it lands
with the green **Verified** badge on GitHub. You (the agent) do **not** decide whether to sign —
git does it for you because `commit.gpgsign=true` is configured, and the
[`scripts/setup-signing.sh`](scripts/setup-signing.sh) helper keeps that config in place. You
should never need a reminder to sign.

How it stays configured without anyone remembering:

- The `SessionStart` hook in [`.claude/settings.json`](.claude/settings.json) runs
  `bash scripts/setup-signing.sh` at the start of every agent session. The script is idempotent
  — it sets the repo-local signing config (`gpg.format=ssh`, `user.signingkey`,
  `commit.gpgsign=true`, `tag.gpgsign=true`, `gpg.ssh.allowedSignersFile`) if it isn't already,
  then exits silently.
- A fresh clone doesn't carry repo-local git config, so the hook re-applies it the first session
  in that clone. If you ever see an unsigned commit or git complains about `user.signingkey`,
  run `bash scripts/setup-signing.sh` directly — it's safe to run any time.

How this differs from StoryCut (which projitect's setup is adapted from): StoryCut rewrites the
**author identity** to `Claude Code (<contributor>)` via per-worktree config, gated on `claude/*`
branches. projitect keeps the contributor's normal authorship (you author as the contributor,
with a `Co-Authored-By` trailer) and configures **signing only**, repo-local, on every branch.
The goal here is the Verified badge on every commit, not a separate author identity.

**One-time machine setup** (per machine, for a new contributor): generate the dedicated key,
register it on GitHub as a **Signing Key**, and run `bash scripts/setup-signing.sh`. The full
steps are in [docs/agents-signing.md](docs/agents-signing.md). Skip it entirely if your commits
already show Verified.

If `setup-signing.sh` finds no key, it prints a one-line hint and exits 0 — it never blocks a
session or a CI install, so the only consequence of skipping setup is unsigned commits.

## No destructive shortcuts

When a check fails, fix the root cause. **Do not**:

- Add `as any` or `// @ts-ignore` to silence type errors
- Skip tests or mark them `.skip` to make CI green
- Commit with `--no-verify` to bypass hooks
- `pnpm install --ignore-scripts` to dodge a postinstall failure
- Delete a test that "doesn't apply anymore" without writing what replaces it

If you can't fix the underlying issue in this PR, leave it failing and flag it.

## Marketing site is latest-only

The Astro Starlight site under `apps/website` is written in **present tense as if the latest
version is the only one that ever existed**. Historical docs are out of scope for v0.x.

- Renaming a flag means updating every reference on the site, not adding a "previously named X" note.
- Removing a feature means deleting its docs, not marking them deprecated.
- Adding a feature means adding its docs in the same PR.
- Versioned URLs are not in scope.

This is a stylistic standard. Reviewers reject docs that read like a changelog.

## Marketing site coordination at every phase

The site is not a release-time chore — it's a **continuous obligation**. Three sequential gates:

### Plan-time

Every plan in `~/.claude/plans/` that introduces a user-facing change must explicitly list
which marketing pages it will touch. "Add `--json` flag to `pjt inspect`" without naming
`apps/website/src/content/docs/docs/cli/inspect.mdx` is an incomplete plan.

Triggers — if your change does any of the following, plan a docs edit:

| Change                                                                          | Docs to touch                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Add / rename / remove a CLI command, flag, or argument                          | `docs/cli/<cmd>.mdx`                                                                               |
| Add / rename / remove an SDK export, blueprint constructor, or permission shape | `docs/authoring.mdx` (+ maybe `docs/concepts/*.mdx`)                                               |
| Change an ownership mode's behavior or add a new mode                           | `docs/concepts/ownership-modes.mdx`                                                                |
| Add / rename a `pjt.*` error id                                                 | `errors/<id>.mdx` (gated by `check:errors`)                                                        |
| Change marketing copy that's now untrue                                         | `index.mdx` + relevant pages                                                                       |
| Add or change a worked example                                                  | `apps/website/examples/<name>/example.ts` + `docs/examples/<name>.mdx` (gated by `check:examples`) |
| Change the lockfile schema, projitect blueprint, or pipeline shape              | `docs/concepts/drift-detection.mdx` + `docs/concepts/blueprints.mdx`                               |

### Implementation-time

**The PR that lands the code change must also land the marketing edits.** No "docs follow-up"
PRs. CI gates:

- `pnpm --filter website check:errors` — every error id has an MDX page.
- `pnpm --filter website check:examples` — every example file under `apps/website/examples/` typechecks.
- `pnpm --filter website build` — the Astro site builds end-to-end.

The human reviewer additionally checks the prose on touched pages for freshness.

### Release-time

At release time the docs are already correct by construction. The procedural parts (changeset,
version bump, publish) are handled by the `release-bump` skill at `.claude/skills/release-bump/`.

## Versioning (lockstep)

All published packages (`projitect` and every `@projitect/*`) share one version, bumped together
via changesets. Pick the bump type per this table — cite the rule when running `pnpm changeset`:

| Change                                                                                                                                                         | Bump      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Breaking change in any public API (Blueprint shape, ChangeSet shape, Permission shape, CLI flag rename/removal, error id rename/removal, lockfile schema bump) | **major** |
| New public feature (new ownership mode, new CLI command, new error class with new id, new SDK helper, new blueprint package)                                   | **minor** |
| Bug fix, doc-only change, internal refactor, dep bump that doesn't change consumer-visible behavior                                                            | **patch** |

When in doubt about bump severity, pick the higher one. Cost of an unnecessary major is low (no
consumer breakage); cost of an unannounced major is high.

## Dependency upgrades (Renovate)

Renovate runs on this repo and opens PRs for dep upgrades. Configured at
[renovate.json5](./renovate.json5). Two things to know:

- Most packages are published libraries, so the default `rangeStrategy` is `update` (caret/tilde ranges preserved — consumers dedupe). The workspace root `package.json` and `apps/website/package.json` are private, so they pin exact versions via `matchFileNames` overrides.
- Non-major bumps, devDep majors, and lockfile maintenance auto-merge. Runtime-dep majors (Effect v3 → v4, etc.) wait for human approval. PRs queue for `minimumReleaseAge` (3-8 days depending on dep type) to dodge the npm 72-hour unpublish window.

When adding a new published `@projitect/*` package: nothing to do — it inherits the default js-lib semantics. When adding a new `apps/*` private package: extend the `matchFileNames` rule to include it.

## CLAUDE.md ↔ AGENTS.md

`CLAUDE.md` is a symbolic link to this file. If you find yourself editing both, you've broken
the symlink — restore it with `ln -sf AGENTS.md CLAUDE.md` from the repo root.
