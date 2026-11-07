---
name: new-blueprint
description: Scaffold a first-party blueprint package `@projitect/blueprint-<name>` — package layout from new-package, an ownership mode with the matching SDK helper, declared permissions, in-memory tests, and the marketing-site pages that must change with it. Use when adding a new blueprint to the repo.
---

# new-blueprint

A blueprint is a package named `@projitect/blueprint-<name>` in `packages/blueprint-<name>/`. Do all of
[new-package](../new-package/SKILL.md) first (layout, tsconfigs, root references, lockfile), with these
blueprint-specific differences.

## Steps

### 1. Package manifest

- `peerDependencies`: `@projitect/blueprint`, `@projitect/core`, `effect` (as in `blueprint-gitignore`);
  mirror them in `devDependencies`, plus `@projitect/test-kit`.
- tsconfig `references`: `../core` and `../blueprint`.
- Add the `projitect` metadata block at the end of `package.json`:

```json
"projitect": {
  "type": "blueprint",
  "import": "import { <fn> } from \"@projitect/blueprint-<name>\"",
  "call": "<fn>()"
}
```

(Blueprint sets like `blueprint-gitignore` use `"type": "blueprint-set"` with `callTemplate` and `sections`.)

### 2. Choose the ownership mode

| Mode     | SDK helper                                       | Use for                                |
| -------- | ------------------------------------------------ | -------------------------------------- |
| `region` | `ignoreSection`, `markdownSection`, `regionFile` | Text file shared with other blueprints |
| `merge`  | `jsonMerge`                                      | Specific keys of a JSON file           |
| `owned`  | `ownFile`                                        | One blueprint owns the whole file      |
| `seed`   | `seedFile`                                       | Write-once, never enforced             |

Reach for `ignoreSection` / `markdownSection` before `regionFile`. Region owner ids are `pjt:<name>:<part>`.
A composite blueprint folds its parts with `ChangeSet.Reducer.combineAll`. See `packages/blueprint-changesets`
(merge + owned) and `packages/blueprint-gitignore` (region) for worked shapes.

### 3. Sandbox rules

- Declare every `Permission` the blueprint needs (`{ kind: "write", glob: "..." }`).
- Access the disk only through `BlueprintFileSystem`. **Never** import `node:*` or `FileSystem` from
  `@effect/platform` — ESLint enforces this for `packages/blueprint-*/**`.
- Tests use `makeInMemoryLayer` from `@projitect/test-kit` and assert on the emitted operations.

### 4. Marketing site (same PR)

Per [AGENTS.md → Marketing site coordination](../../../AGENTS.md), update:

- `apps/website/src/content/docs/docs/authoring.mdx` and `docs/concepts/blueprints.mdx` (the new package/export)
- `apps/website/src/content/docs/docs/getting-started.mdx` if it is user-facing
- a worked example: `apps/website/examples/<name>-setup/example.ts` plus
  `apps/website/src/content/docs/examples/<name>-setup.mdx` (model on `changesets-setup`)
- `apps/website/src/content/docs/index.mdx` if the marketing copy lists blueprints
- `apps/website/package.json`: add `"@projitect/blueprint-<name>": "workspace:*"` (alphabetized) so the
  example typechecks; run `pnpm install` afterwards

Write present-tense, latest-only prose.

### 5. Smoke script

Add the package to the install list and to the blueprint table in `scripts/smoke.sh` so the end-to-end
run covers it (see how `blueprint-changesets` is wired).

### 6. Verify

- `pnpm install`, `pnpm build`
- `pnpm check-all`
- `pnpm --filter website check:examples`
- `pnpm --filter website build`
- `./scripts/smoke.sh`

### 7. Changeset and commit

New blueprint package → **minor**: `.changeset/add-blueprint-<name>.md` with `"projitect": minor`. Commit
per [create-commit](../create-commit/SKILL.md).
