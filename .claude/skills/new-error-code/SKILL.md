---
name: new-error-code
description: Add a new projitect error end to end — a Schema.TaggedError in packages/core, its registry id, its `pjt explain` blurb and its MDX page on the website — so `pnpm --filter website check:errors` stays green. Use whenever a new `pjt.<subsystem>.<kebab>` error id is needed.
---

# new-error-code

Follows [Blueprint authoring → Error catalog](../../../docs/blueprint-authoring.md#error-catalog). Ask for (or derive) the id
`pjt.<subsystem>.<kebab-case>` and the payload fields first. Example below: `pjt.cache.stale` /
`CacheStale`.

## Steps

### 1. Define the error class

In `packages/core/src/errors/index.ts`, add the class under the matching section-comment block (or a
new block in the same `// ----` style):

```ts
export class CacheStale extends Schema.TaggedError<CacheStale>()("CacheStale", {
  id: Schema.Literal("pjt.cache.stale"),
  path: Schema.String,
  message: Schema.String,
}) {}
```

The tag is the PascalCase class name; the `id` literal is the semantic id; `message` is always present.
`packages/core` is runtime-pure: no `node:*` imports.

### 2. Register the id

In the same file, add the id to the `ERROR_IDS` array (the literal must match the class' `id` field).
The classes are already exported from this module, which `packages/core/src/index.ts` re-exports as
`Errors`.

### 3. Add the `pjt explain` blurb

`packages/cli-internals/src/commands/explain.ts` has an `ERROR_BLURBS` record typed over every
`ErrorId`, so `pnpm tc` fails until the new id has a one- or two-sentence blurb there.

### 4. Add the docs page

Create `apps/website/src/content/docs/errors/pjt.cache.stale.mdx`:

```mdx
---
title: pjt.cache.stale
slug: errors/pjt.cache.stale
description: One-line summary of the failure.
sidebar:
  label: pjt.cache.stale
---

**What**: What happened, in the user's terms.

**Why**: The usual cause.

**How to fix**: Concrete steps.
```

Then link it from the matching section of `apps/website/src/content/docs/errors/index.mdx`.

### 5. Handle it with `Match`, no casts

Where the error is consumed, use `Match.valueTags` / `Match.tag` + `Match.exhaustive` (see
[effect-conventions → Match over if/else](../effect-conventions/SKILL.md#match-over-ifelse)), never `as` casts. Raise it with
`yield* new CacheStale({ ... })` — do not wrap in `Effect.fail`.

### 6. Verify

- `pnpm build` (the website check reads built `@projitect/core`)
- `pnpm --filter website check:errors`
- `pnpm check-all`

### 7. Changeset and commit

A new error id is a **new public feature → minor** bump: add `.changeset/<kebab-name>.md` with
`"@projitect/cli": minor`. Commit per [create-commit](../create-commit/SKILL.md): `feat(core): add pjt.cache.stale error`.
