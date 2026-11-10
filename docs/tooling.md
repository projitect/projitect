# Tooling

ESLint, Prettier, the Effect language service, pre-commit hooks and CI. The index and the verification ritual live in [AGENTS.md](../AGENTS.md); see also [getting started](./getting-started.md).

## ESLint absorbs Prettier

One tool, one config, one command. Adapted from StoryCut's and effect-clue's flat configs:

- `eslint-plugin-prettier/recommended` runs Prettier as an ESLint rule. Formatting drift surfaces as a `prettier/prettier` lint error — no separate `prettier --check` step.
- For files ESLint doesn't parse (MDX, YAML, JSON5, CSS) the `pnpm format` script invokes Prettier directly. `lint-staged` covers them automatically on commit.
- The rule set is ported from StoryCut's: `typescript-eslint` **strict + stylistic** type-checked presets, `unicorn`'s **`flat/all`** preset, `eslint-plugin-import` (syntactic rules only — the resolver-backed ones are redundant with tsc), and StoryCut's core-quality rules (`eqeqeq`, `no-else-return`, `prefer-template`, `strict-boolean-expressions`, …). Each comes with a small list of overrides for rules that clash with Effect-heavy code (`unicorn/no-null`, `no-array-reduce`, `prefer-json-parse-buffer`, etc.) or with NodeNext resolution (`import/no-useless-path-segments` is omitted — it strips the `/index.js` NodeNext requires). See [eslint.config.js](../eslint.config.js) for the canonical list with rationale.
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

The package's `prepare` script runs `effect-language-service patch` on every `pnpm install`. This patches the local `node_modules/typescript` so that **`tsc --build` produces Effect-specific diagnostics in addition to the standard TS checks** — things like `yield* Effect.fail(new X())` being flagged as redundant (since `new X()` is itself yieldable for `Schema.TaggedError` errors), `Effect.sync` thunks accidentally returning a Promise, missing Effect requirements, etc.

If you delete `.tsbuildinfo` files or wipe `node_modules` and the patch doesn't seem to be applied, run `pnpm install` to re-fire `prepare`. `pnpm effect-language-service check` verifies the patch state.

The `tsconfig.base.json`'s `"plugins": [{ "name": "@effect/language-service" }]` covers the editor / LSP side. The `patch` covers the build / CLI side. Both should be active.

## Test files are typechecked

`pnpm tc` (`tsc --build`, the first step of `pnpm check-all` and the CI `typecheck` job) covers
every package's `test/` directory, not only `src`. Each `packages/<name>/test/tsconfig.json` is a
composite project (`emitDeclarationOnly`, output to the gitignored `test/dist`) referenced from the
root `tsconfig.json`, so a type error in a test fails the build exactly like one in `src`. Vitest's
own `typecheck` mode is not used.

- **Every `test/tsconfig.json` must be referenced from the root `tsconfig.json`.** An unreferenced
  test project is silently unchecked; the `new-package` skill covers the wiring.
- **Type-level assertions are enforced here.** A wrong `expectTypeOf` assertion or an unused
  `@ts-expect-error` is a compile error in `pnpm tc`. Vitest never runs them, so a green `pnpm test`
  says nothing about types.
- **Probing the gate:** add `const x: number = "a"`, an unused `// @ts-expect-error` or
  `expectTypeOf<string>().toEqualTypeOf<number>()` to a test file, confirm `pnpm tc` exits nonzero,
  then remove it.

**Stating a type-level acceptance criterion in a story.** Cite this gate, for example: "A type-level
test in the package's `test/` directory asserts the args type and fails `pnpm tc` when it is
wrong." That makes the criterion checkable by `pnpm check-all` alone.

## Pre-commit hooks (husky + lint-staged)

Configured via the root [`package.json`](../package.json)'s `lint-staged` field and
[`.husky/pre-commit`](../.husky/pre-commit).

- JS / TS files: `eslint --fix --max-warnings=0` — runs ESLint with the prettier integration, fixes what it can, fails the commit on any remaining issue.
- MDX / YAML / JSON5 / CSS files: `prettier --write`.

Husky is bootstrapped via the `prepare` script — `pnpm install` triggers `husky` which creates `.husky/_/` for the runner shims. The actual hook (`pre-commit`) is committed.

When a commit is blocked: read the lint-staged output, fix the surfaced errors, and re-stage. Don't `git commit --no-verify` to bypass — `--no-verify` is forbidden by the "no destructive shortcuts" rule below.

## CI (GitHub Actions)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) defines one job per check. All eleven jobs
run in parallel on every PR and every push to `main`. Concurrency group cancels in-progress
runs on new pushes to the same ref. Default Node version is sourced from `.nvmrc` (22.12);
behavioral jobs run a 22 + 24 matrix.

| Job               | Matrix       | What it runs                                                                          |
| ----------------- | ------------ | ------------------------------------------------------------------------------------- |
| `typecheck`       | node 22 / 24 | `pnpm tc` (`src` and `test` projects)                                                 |
| `lint`            | (.nvmrc)     | `pnpm lint` (code style + Prettier formatting via `eslint-plugin-prettier`)           |
| `test`            | node 22 / 24 | `pnpm test` (Vitest unit suites; `needs: build-packages`)                             |
| `knip`            | (.nvmrc)     | `pnpm knip`                                                                           |
| `guidance`        | (.nvmrc)     | `pnpm check:guidance` (AGENTS.md size, symlink, links, docs index, skill frontmatter) |
| `build-packages`  | (.nvmrc)     | `pnpm build` — uploads `packages/*/dist/` as a build artifact                         |
| `build-website`   | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website build`                      |
| `check-errors`    | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website check:errors`               |
| `check-examples`  | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website check:examples`             |
| `smoke`           | node 22 / 24 | downloads the build artifact, then `./scripts/smoke.sh`                               |
| `publish-dry-run` | (.nvmrc)     | `pnpm -r --filter './packages/*' publish --dry-run --no-git-checks --access public`   |

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
