# projitect backlog

Remaining work, tracked as atomic user-story-level items. Each story is independently shippable
and lists acceptance criteria as checkboxes. Format:

```
### ID — Title
_As a <role>, I want <capability>, so that <benefit>._
- [ ] acceptance criterion
> Depends on: …  ·  Size: S / M / L
```

Roles: **maintainer** (works on projitect itself) · **author** (publishes blueprint packages) ·
**user** (project maintainer consuming blueprints via `pjt`).

Already-shipped work is tracked too — see the **Shipped (v0 → v0.3)** section at the bottom,
checked off as a record of what's in code. Everything above it is still pending.

---

## Epic: Agent guidance & skills

Bring projitect's `AGENTS.md` and `.claude/skills/` up to the depth of the sibling StoryCut repo
(`/Users/kapil/Github/StoryCut/StoryCut`), which has a 61 KB `AGENTS.md` and 15 skills vs
projitect's thinner guide and single `release-bump` skill. Do this early — it raises the floor for
how every later ticket gets executed.

### GUIDE-1 — Adopt StoryCut's general-engineering AGENTS.md sections

_As a maintainer, I want the load-bearing engineering guidance from StoryCut's `AGENTS.md` merged into projitect's, so that agents working here get the same battle-tested discipline without me re-deriving it._
Approach: **copy/paste, don't rewrite.** Keep adopted sections as close to verbatim as possible; modify only what's needed to fit a pnpm library/CLI monorepo that's Effect-native (vs StoryCut's Next.js + video-domain app). Decide section-by-section from first principles — adopt general engineering discipline, skip StoryCut's app/runtime/domain specifics.

- [ ] **Merge into, don't replace** projitect's existing `AGENTS.md` — preserve the projitect-specific sections StoryCut lacks (ESLint-absorbs-Prettier, marketing-site coordination, blueprint authoring rules, ownership modes, region-marker convention, lockstep versioning, Effect LS patch, Renovate)
- [ ] Adopt the high-value Effect sections, **checking each snippet against Effect v4** (StoryCut is likely v3 — `Schema.optional`, `Data` vs `Schema.TaggedError`, etc. may differ): "Match over if/else", "Predicates for type checks", "Dual functions", "Data-first vs `pipe`", "`Result` over custom discriminated unions", "Quick reference"
- [ ] Adopt the "FP mindset" cluster (Spotting reuse opportunities · Where utilities live · Check existing utilities first · Designing a good utility) — broadly applicable
- [ ] Adopt the workflow/discipline sections that are stronger than projitect's current text: "About the Bash tool's fresh subshells", "Forbidden shortcuts when fixing failures", "Atomic, reviewable commits", "Commit identity for agents"
- [ ] Adopt the "Tests" guidance (exhaustive coverage for pure utilities; working with existing tests) — now relevant since projitect has a real suite
- [ ] **Skip** (StoryCut-specific): Architecture/Key layers, Action+Schema, Auth, Database, `nn`, `FormDataX`, `StructX`, Routes object, React/JSX rules, `DateToLocaleString`, Sort orders, Worktree dev env, Local sign-in, Dev server lifecycle, Tech stack, the FCPXML/OTIO/Remotion material
- [ ] `CLAUDE.md` remains a symlink to `AGENTS.md` (`ln -sf AGENTS.md CLAUDE.md`)
- [ ] Each adopted section reads cohesively top-to-bottom (no half-merged StoryCut references to features projitect doesn't have)
  > Size: L

### GUIDE-2 — Adopt + adapt StoryCut's skills

_As a maintainer, I want the workflow and scaffolding skills projitect is missing, so that common multi-step chores are codified rather than improvised._
Approach: copy the generic skills nearly verbatim; rewrite the scaffolding skills' bodies to projitect's structure while keeping StoryCut's skill shape/format.

- [ ] Copy the workflow skills largely verbatim (adjust commands to pnpm/this repo): `create-commit`, `verify-commit`, `push-pr`, `rebase-main`
- [ ] Adapt StoryCut's scaffolding skills (`new-module` / `new-domain-model` / `new-repository` / `new-domain-action`) into projitect equivalents the v0 plan named but never created: **`new-package`** (scaffold a workspace package: package.json + tsconfig + test/tsconfig + root-tsconfig ref), **`new-blueprint`** (scaffold a blueprint module inside an existing blueprint package), **`new-error-code`** (new `Schema.TaggedError` in core + export + matching `errors/<id>.mdx`, per the existing AGENTS.md recipe)
- [ ] **Skip** the domain-specific skills: `fcpxml-format`, `otio-format`, `validate-fcpxml`, `remotion-player`, `next-client-component`, `preview-flows`
- [ ] Keep the existing `release-bump` skill untouched
- [ ] Each new skill's frontmatter/`SKILL.md` matches the format the harness expects (verified by it appearing in the skills list)
  > Depends on: GUIDE-1 (shared conventions) · Size: M

---

## Epic: Manual / owner actions

**Not automatable by an agent** — these need you, signed into GitHub / npm / Vercel / a DNS
registrar, clicking through dashboards or holding credentials. Grouped here so there's one
checklist of everything that's blocked on a human. The release (REL-6) and snapshot (REL-7)
work can't land until the relevant items here are done.

### OPS-1 — Repo housekeeping after the org transfer

_As a maintainer, I want the moved repo's PRs and redirects sane, so that the transfer leaves no loose ends._

- [x] Confirm `StoryCut/projitect` redirects to `projitect/projitect` (checked 2026-10-07)
- [ ] Confirm PR #1 (`v0.1` → `main`) still resolves at the new URL
- [ ] Triage the stray open PR #2 ("docs: add AGENTS.md…", branch `agent/engineer/0d5e61d1`) — close it if superseded by the AGENTS.md work on `v0.1`
  > Size: S · **Manual**

### OPS-2 — GitHub repo settings + branch protection

_As a maintainer, I want `main` protected and the merge strategy locked to merge-commits, so that the conventional-commit history is preserved and CI gates every merge._

- [ ] Default branch set to `main`
- [ ] Merge button: **merge commits only** (disable squash + rebase — AGENTS.md mandates merge commits to preserve the conventional-commit history)
- [ ] Branch protection on `main`: require the CI checks (typecheck/lint/test/knip/build/smoke/etc.) to pass, require ≥1 PR review, no direct pushes
  > Size: S · **Manual**

### OPS-3 — Enable Actions to open PRs (changesets bot)

_As a maintainer, I want the changesets "Version Packages" PR to open automatically, so that releases don't require a hand-created PR._

- [ ] In repo/org settings → Actions → General: enable "Allow GitHub Actions to create and approve pull requests"
- [ ] `release.yml` has `permissions: contents: write, pull-requests: write` (verify; fix in code if missing — that part is automatable)
  > Size: S · **Manual** (the toggle) · unblocks REL-6

### OPS-4 — GitHub repo metadata

_As a maintainer, I want the repo to present well, so that visitors understand it at a glance._

- [ ] Description set
- [ ] Topics added (e.g. `scaffolding`, `effect`, `monorepo`, `typescript`, `cli`)
- [ ] Homepage URL set to the marketing domain (after OPS-8/OPS-9)
- [ ] Social-preview image (optional)
  > Size: S · **Manual**

### OPS-5 — npm scope + name reservation

_As a maintainer, I want the `@projitect` scope and the unscoped `projitect` name secured, so that the lockstep release can publish under the intended names._

- [ ] `@projitect` org/scope created on npm
- [ ] Unscoped `projitect` package name confirmed available (or claimed); if taken, decide on an alternative and update the package name + all references
- [ ] Publish team / 2FA policy set
  > Size: M · **Manual** · unblocks REL-6

### OPS-6 — npm trusted publishing (OIDC) or token

_As a maintainer, I want `release.yml` able to publish without a long-lived secret, so that releases are secure and low-maintenance._

- [ ] OIDC trusted publisher configured for `projitect/projitect` on each package, **or** an `NPM_TOKEN` repo secret added
- [ ] A `pnpm publish --dry-run` (already in CI) plus one real/staged publish validates the path
  > Size: M · **Manual** · unblocks REL-6, REL-7

### OPS-7 — Install the Renovate GitHub App

_As a maintainer, I want Renovate active on `projitect/projitect`, so that dependency PRs open automatically per `renovate.json5`._

- [ ] Renovate App installed on the org/repo
- [ ] First dependency-dashboard issue appears
  > Size: S · **Manual**

### OPS-8 — Vercel project for the marketing site

_As a maintainer, I want `apps/website` deployed continuously, so that the docs + `/errors/<id>` pages the CLI links to actually resolve._

- [ ] Vercel project created and linked to `projitect/projitect`
- [ ] Root directory set to `apps/website`; build command `pnpm --filter website build` (or framework preset); install at workspace root
- [ ] Preview deploys on PRs, production on `main`
- [ ] `/errors/<id>` resolves for every shipped error id
  > Size: M · **Manual**

### OPS-9 — Domain + DNS

_As a maintainer, I want projitect.dev (or the chosen domain) pointing at Vercel, so that the CLI's printed URLs are live._

- [ ] Domain registered (or already owned)
- [ ] DNS pointed at the Vercel project; domain attached + verified in Vercel
- [ ] Any `projitect.dev` references in the CLI / docs match the final domain
  > Depends on: OPS-8 · Size: S · **Manual**

### OPS-10 — Root LICENSE file

_As a maintainer, I want a LICENSE at the repo root, so that the MIT declaration in every `package.json` is backed by an actual license file npm can ship._

- [ ] Confirm the copyright holder name to use
- [ ] Add `LICENSE` (MIT) at the root — agent can draft this once the holder is confirmed
- [ ] Ensure each published package includes LICENSE in its `files` (or relies on the root)
  > Size: S · **Manual decision** (holder), then automatable

---

## Epic: Release readiness

Automatable code/release work for the first public npm release. The manual blockers live in the
**Manual / owner actions** epic above.

### REL-1 — Point changeset changelog at the new repo

_As a maintainer, I want the changelog generator to reference `projitect/projitect`, so that
release notes link to the right GitHub repo._

- [x] `.changeset/config.json` `changelog` `repo` is `projitect/projitect` (previously the stale `kapilkale/projitect`)
- [ ] A test changeset renders links that resolve
  > Size: S

### REL-2 — Grep the codebase for stale repo references

_As a maintainer, I want every `kapilkale/projitect` and `StoryCut/projitect` reference updated to `projitect/projitect`, so that links in docs, package.json `repository` fields, and CI don't 404._

- [x] `rg -n 'kapilkale/projitect|StoryCut/projitect'` returns only intentional historical matches
- [x] Each published package's `package.json` has a correct `repository` field
- [x] Marketing site footer / edit-links point at the new repo
  > Depends on: git remote already moved · Size: S

### REL-6 — Cut v0.1.0

_As a maintainer, I want the first lockstep release published, so that `npx pjt init` works for external users._

- [ ] `pnpm changeset` with a minor bump (cite the AGENTS.md rules table)
- [ ] "Version Packages" PR merged
- [ ] CI publishes all packages at one shared version
- [ ] `npx pjt init` validated in a throwaway dir against the public registry
  > Depends on: REL-1, REL-2, OPS-3, OPS-5, OPS-6 · Size: M

### REL-7 — Snapshot publishes on PR branches

_As a maintainer, I want canary `--snapshot` publishes from PRs, so that a blueprint change can be tried end-to-end before it's released._

- [ ] A workflow publishes `0.0.0-<sha>` snapshots on labeled PRs
- [ ] The PR gets a comment with the install command
  > Depends on: OPS-6 · Size: M

### REL-8 — Comment on released issues/PRs with the published version

_As a maintainer, I want the release workflow to comment on the issues and PRs included in a release with the published version, so that contributors and reporters learn their fix shipped without me pinging them by hand — the `@semantic-release/github` behavior, rebuilt for changesets._

- [ ] After a successful publish, each issue/PR included in the release gets a comment naming the published version with a link to the GitHub release / npm
- [ ] Gated on `changesets/action`'s `outputs.published == 'true'`; reads `outputs.publishedPackages` for the version — no comment on no-op runs
- [ ] PR→issue linkage resolved from closing keywords (`Fixes #N`) in the rolled-up PR bodies (the `issue-parser` approach), **or** scoped to the merged "Version Packages" PR and the PRs it includes — pick one and document the choice
- [ ] Idempotent: re-running the workflow does not double-post
- [ ] No drop-in plugin exists and changesets has no post-publish hook — implement as a **committed local script** (e.g. `scripts/announce-release.ts`, Octokit + `GITHUB_TOKEN`, testable, no new runtime dep) called from the release workflow after publish; inline `actions/github-script` is the lighter fallback
- [ ] Reports the single lockstep version (one message), not per-package noise
  > Depends on: REL-6 (release workflow live) · Size: M

---

## Epic: Schema-driven blueprint arguments

Make every blueprint declare its argument shape with Effect Schema. Validated when called as a
function today; reusable for parsing untrusted input (CLI prompts, JSON config) tomorrow. This
epic is the foundation the generated `add` CLI (NPX) builds on.

### ARG-1 — `BlueprintDefinition` + `defineBlueprint` in the SDK

_As an author, I want to declare a blueprint as `{ id, args: Schema, build: (args) => Blueprint }`, so that the arg shape is a first-class, introspectable value rather than a bare TS interface._

- [ ] `BlueprintDefinition<A>` type added to `@projitect/blueprint` (factory carries `id`, `args` Schema, `build`)
- [ ] `defineBlueprint(def)` returns a callable `(args) => Blueprint` plus the `.definition` for introspection
- [ ] Calling with no args is allowed when every field is optional / has a default
- [ ] Type inference: `vitest(args)` rejects unknown keys / wrong types at compile time
  > Size: M

### ARG-2 — Validate args, surface `pjt.blueprint.invalid-args`

_As a user, I want a clear error when I pass bad args to a blueprint, so that a typo in `.pjt.ts` doesn't produce a confusing import crash._

- [ ] Invalid args fail through the Effect error channel (defer validation into the `plan` Effect, not a synchronous throw at module-load), so the loader doesn't report a generic `pjt.loader.import-failed`
- [ ] New `pjt.blueprint.invalid-args` error class in `@projitect/core` with the blueprint id + the Schema parse issue
- [ ] Matching `errors/pjt.blueprint.invalid-args.mdx` page (gated by `check:errors`)
- [ ] Unit test: a blueprint called with an out-of-range arg reports the id + offending field
  > Depends on: ARG-1 · Size: M

### ARG-3 — Arg introspection: Schema AST → prompt descriptors

_As a maintainer, I want a helper that turns a blueprint's `args` Schema into a list of prompt descriptors (name, kind, options, default, description), so that the CLI can render prompts without hand-written metadata._

- [ ] `describeArgs(definition)` returns descriptors for string / number / boolean / literal-union / nullable fields
- [ ] Field descriptions are sourced from Schema annotations
- [ ] Unsupported Schema shapes degrade to a freeform-text prompt with a warning, never a crash
- [ ] Unit tests over each supported Schema shape
  > Depends on: ARG-1 · Size: M

### ARG-4 — Migrate shipped blueprints to declare `args`

_As a maintainer, I want gitignore / vitest / tsconfig / the projitect blueprint to use `defineBlueprint` with real arg schemas, so that the new validation + introspection covers everything we ship._

- [ ] `vitest`, `tsconfig` options expressed as Schemas (replacing the TS interfaces)
- [ ] `gitignores.*` section set expressed via the definition shape (sections are nullary, but go through `defineBlueprint` for consistency)
- [ ] The projitect bootstrap blueprint migrated
- [ ] Existing unit + smoke suites stay green (on-disk output unchanged)
  > Depends on: ARG-1, ARG-2 · Size: M

### ARG-5 — Authoring docs for declared args

_As an author, I want a docs section on declaring args with Schema, so that I follow the convention when publishing._

- [ ] `docs/authoring.mdx` gains a "Declaring arguments" section with a worked example
- [ ] Note on how args feed the `add` CLI prompts (forward-ref to NPX epic)
  > Depends on: ARG-1 · Size: S

---

## Epic: Generated `npx <package> add` CLI

A blueprint package ships a bin so users can run `npx @org/blueprint-foo add`. The CLI selects a
blueprint (if the package exports several), prompts for args (driven by ARG-3), validates, and
splices into the user's `.pjt.ts`. The CLI implementation lives in `@projitect/blueprint` so it
updates automatically when that dep bumps — packages get it "for free."

### NPX-1 — Extract shared splice + prompt code into `@projitect/blueprint`

_As a maintainer, I want the `.pjt.ts` splice logic and the section/arg prompt logic shared between `pjt add` and the per-package CLI, so that there's one implementation, not two._

- [ ] `edit-pjt` splice logic reachable from `@projitect/blueprint` (move it down, or factor a shared module both packages import) without breaking the blueprint-package sandbox import bans
- [ ] `pjt add` (in cli-internals) refactored to call the shared code — no behavior change, smoke stays green
  > Depends on: (none, but unblocks NPX-2..6) · Size: L

### NPX-2 — `runAddCli(definitions)` entrypoint

_As an author, I want a one-call CLI driver I can point my package's bin at, so that I don't write CLI code by hand._

- [ ] `runAddCli({ packageName, definitions })` exported from `@projitect/blueprint` (or `@projitect/blueprint/cli` subpath)
- [ ] Resolves the user's project root + `.pjt.ts`; if absent, prints how to `pjt init` (see NPX-5)
- [ ] Wired through `effect/unstable/cli` `Command.run` with the Node platform layers
  > Depends on: NPX-1 · Size: M

### NPX-3 — Blueprint selection prompt

_As a user, I want to pick which blueprint to add when a package exports several, so that `npx @org/foo add` works for multi-blueprint packages._

- [ ] When >1 definition exported: `Prompt.select` (single) or `Prompt.multiSelect` (sets) over the definitions, keyed by id + description
- [ ] When exactly 1: skip the prompt
- [ ] `--id <blueprint-id>` flag to bypass the prompt for scripted use
  > Depends on: NPX-2 · Size: M

### NPX-4 — Arg prompts from the Schema

_As a user, I want to be prompted for each arg the chosen blueprint needs, with validation, so that I don't have to read the package README to know what to pass._

- [ ] Render one prompt per descriptor from `describeArgs` (text / number / confirm / select)
- [ ] Re-prompt on validation failure with the Schema's error message
- [ ] Defaults pre-filled; pressing enter accepts the default
- [ ] `--set key=value` flags to pre-supply args non-interactively
  > Depends on: NPX-2, ARG-3 · Size: L

### NPX-5 — Splice the selected blueprint into `.pjt.ts`

_As a user, I want the chosen blueprint + its args written into my `.pjt.ts`, so that the next `pjt remodel` applies it._

- [ ] Import line + call line (with chosen args serialized) spliced between the convention markers
- [ ] Args serialized as a valid TS object literal (strings quoted, etc.)
- [ ] Dedup: re-adding the same import is a no-op
- [ ] If `.pjt.ts` is missing, offer to run the `pjt init` flow first (or print the command)
- [ ] Prints "added — run `pjt remodel`" on success
  > Depends on: NPX-1, NPX-4 · Size: M

### NPX-6 — Bin convention so packages get the CLI for free

_As an author, I want a one-line bin that delegates to the shared CLI with my package's exports, so that I don't maintain CLI code and it auto-updates when `@projitect/blueprint` bumps._

- [ ] Documented bin shim that imports the package's definitions and calls `runAddCli`
- [ ] The shim is tiny and stable; all logic lives in `@projitect/blueprint`
- [ ] `@projitect/blueprint-gitignore` ships the bin as the canonical example (`npx @projitect/blueprint-gitignore add`)
- [ ] Smoke: `npx`-style invocation against a temp project adds a section end-to-end
  > Depends on: NPX-2..5 · Size: M

### NPX-7 — Reconcile with the `projitect` package.json metadata field

_As a maintainer, I want the `add` CLI and the existing `"projitect"` metadata convention to not duplicate intent, so that authors declare their blueprints once._

- [ ] Decide: derive the metadata from exported definitions, keep it as a fallback for `pjt add`, or deprecate it
- [ ] `pjt add <pkg>` and `npx <pkg> add` produce identical `.pjt.ts` results for the same selection
- [ ] Docs updated to describe the single source of truth
  > Depends on: NPX-1, ARG-1 · Size: M

---

## Epic: The blueprint blueprint (self-maintaining packages)

A blueprint that keeps blueprint _packages_ coherent — the way the projitect bootstrap blueprint
keeps a consuming project coherent. An author adds it to their package's own `.pjt.ts`; it
maintains the package.json shape, the bin shim, peer deps, and exports map. Handles packages that
export multiple blueprints, and packages that live inside a monorepo.

### BB-1 — `@projitect/blueprint-blueprint` package skeleton

_As an author, I want a blueprint that scaffolds + maintains a blueprint package, so that the standard structure stays current without manual edits._

- [ ] New package exporting a `blueprintPackage({...})` definition (built via `defineBlueprint`)
- [ ] Unit tests over the emitted operations
  > Depends on: ARG-1 · Size: M

### BB-2 — Maintain package.json shape (merge mode)

_As an author, I want my package.json's `bin`, `peerDependencies`, `exports`, scripts, and the `projitect` metadata kept in sync, so that a published package is always installable + wired for the `add` CLI._

- [ ] Merge op owns `bin`, the effect / `@projitect/core` / `@projitect/blueprint` peer ranges, the `exports` map, and standard scripts
- [ ] Re-running after a manual edit re-asserts the managed keys (drift caught by `pjt inspect`)
  > Depends on: BB-1 · Size: M

### BB-3 — Own the bin shim file

_As an author, I want the `add` CLI bin shim generated and kept current, so that I never hand-write CLI wiring._

- [ ] Owned-mode op writes the bin shim that calls `runAddCli` with the package's exports
- [ ] Shim regenerates on `pjt remodel` if edited
  > Depends on: BB-1, NPX-6 · Size: M

### BB-4 — Multiple exported blueprints

_As an author of a multi-blueprint package, I want the scaffolding to enumerate all my exported blueprints, so that the `add` CLI and metadata cover every one._

- [ ] The blueprint accepts the list of exported definition ids/names and wires them into metadata + bin
- [ ] Test: a 3-blueprint package produces selection-ready metadata
  > Depends on: BB-1, BB-2, BB-3 · Size: M

### BB-5 — Monorepo support

_As an author whose blueprint package lives in a workspace, I want the scaffolding to behave correctly inside a monorepo, so that I can develop blueprints alongside other packages._

- [ ] Detects a workspace root (pnpm/npm/yarn workspaces) and places files at the package root, not the workspace root
- [ ] Emits `workspace:*` for intra-workspace deps when in a workspace, caret ranges otherwise
- [ ] Test fixture: a package nested under `packages/` scaffolds correctly
  > Depends on: BB-1 · Size: L

### BB-6 — Dogfood across our own blueprint packages

_As a maintainer, I want gitignore / vitest / tsconfig to be maintained by the blueprint blueprint, so that we prove it and our packages stay consistent._

- [ ] Each shipped blueprint package has its own `.pjt.ts` using `blueprintPackage(...)`
- [ ] `pjt inspect` is clean across all of them in CI
  > Depends on: BB-2..5 · Size: M

### BB-7 — Authoring docs: scaffold a package

_As an author, I want a guide for starting a blueprint package with the blueprint blueprint, so that the happy path is one page._

- [ ] `docs/authoring.mdx` (or a new page) walks: install, add `blueprintPackage`, remodel, publish
  > Depends on: BB-1..6 · Size: S

---

## Epic: Engine capabilities

Core-pipeline features that unlock new blueprint shapes. Distinct from the catalog (which is
blueprints built _on_ the engine).

### ENG-1 — Exec / post-apply operations

_As an author, I want a blueprint to declare a command that runs after all file ops are applied, so that blueprints like `eslint.fix()` / `prettier.fix()` can normalize everything the plan just wrote._

- [ ] New `ExecOp` in the `ChangeSet` union — `{ mode: "exec", ownerId, command, args, check? }` — gated by the existing `{ kind: "exec", command }` permission
- [ ] Applier runs exec ops in a **final phase**, after every region/merge/owned/seed op, in declared (array) order; shells out from cli-internals (trusted — blueprints only _declare_ the command, they don't run it, so the soft sandbox holds)
- [ ] `inspect` runs the op's `check` variant (e.g. `eslint .` / `prettier --check .`) and reports drift **without mutating**; `remodel` / `build` run the fix variant
- [ ] Ordering guarantee documented: exec ops always run last, so a `*.fix()` blueprint placed anywhere in the array still post-processes files written by every other blueprint
- [ ] Lockfile records the claim; removal is a no-op (like `seed` — there's no file to delete)
- [ ] New error `pjt.exec.command-failed` (+ MDX page); permission denial reuses the `exec` permission gate
- [ ] Reuses the `node:child_process` precedent already in `pm.ts` / `git.ts`
- [ ] Security note in docs: ties into SBX-1 — the command runs in the trusted CLI, not the blueprint sandbox; the `exec` permission is the author's declaration of intent

> Depends on: nothing (existing `exec` permission + child_process precedent) · Size: L

---

## Epic: Framework blueprint catalog

More first-party blueprints. Each is a self-contained package following the vitest/tsconfig
pattern: a few ops, unit tests, a smoke section, an example page, a landing-page mention. The
ESLint and Prettier packages each export **two** blueprints — a `config()` that scaffolds the
tool and a `fix()` that auto-fixes the project (the most reliable way to guarantee every
blueprint-written file matches the project's code style).

### CAT-1 — `@projitect/blueprint-prettier`

_As a user, I want a Prettier blueprint that both configures Prettier and auto-formats my project, so that every file the plan writes ends up correctly formatted._

Exports two blueprints:

- `prettier.config({...})` — owned `prettier.config.js` (tabs / semi / printWidth / …); merge package.json `format` script + `prettier` devDep; optional `.prettierignore` via `ignoreSection`
- `prettier.fix({...})` — post-apply exec op (ENG-1) running `prettier --write .` after all file ops; `inspect` runs `prettier --check .` and reports drift

* [ ] Both exports ship; composing only `config` (no `fix`) is valid
* [ ] `fix` declares `{ kind: "exec", command: "prettier" }` and runs in the final phase
* [ ] Unit tests (emitted ops) + smoke (config written; `fix` normalizes a deliberately-misformatted file; `inspect` flags it before fix) + example page

> Depends on: ENG-1 (for `prettier.fix`) · `ignoreSection` shipped · Size: M

### CAT-2 — `@projitect/blueprint-eslint`

_As a user, I want an ESLint blueprint that both configures ESLint and auto-fixes my project, so that blueprint changes always satisfy my lint rules._

Exports two blueprints:

- `eslint.config({...})` — owned flat `eslint.config.js` (including its `ignores`); merge package.json `lint` / `lint:fix` scripts + devDeps (eslint, typescript-eslint, …)
- `eslint.fix({...})` — post-apply exec op (ENG-1) running `eslint --fix .` after all file ops; `inspect` runs `eslint .` and reports drift if anything is auto-fixable

* [ ] Both exports ship; composing only `config` is valid
* [ ] `fix` declares `{ kind: "exec", command: "eslint" }` and runs in the final phase
* [ ] Document the interaction when both `eslint.fix()` and `prettier.fix()` are present: exec ops run in array order, so the user controls sequencing; note the eslint-config-prettier vs eslint-plugin-prettier options so the two don't fight over formatting
* [ ] Unit tests + smoke (`fix` normalizes a deliberately-misstyled file; `inspect` flags it) + example page

> Depends on: ENG-1 (for `eslint.fix`) · `ignoreSection` shipped · Size: M

### CAT-3 — `@projitect/blueprint-husky-lint-staged`

_As a user, I want `huskyLintStaged()` to scaffold the pre-commit hook + lint-staged config, so that commit-time checks are one line._

- [ ] Owned `.husky/pre-commit`
- [ ] Merge package.json: `lint-staged` field + `prepare` script + devDeps
- [ ] Unit tests + smoke + example page
  > Size: M

### CAT-4 — `@projitect/blueprint-changesets`

_As a user, I want `changesets()` to scaffold `.changeset/config.json` + scripts + devDep, so that release tooling is one line._

- [ ] Owned `.changeset/config.json`
- [ ] Merge package.json: `changeset` / `version-packages` scripts + devDep
- [ ] Unit tests + smoke + example page
  > Size: M

---

## Epic: Sandbox hardening

### SBX-1 — Worker-process sandbox

_As a user, I want blueprints to run in an isolated worker process, so that a malicious or buggy blueprint can't touch the disk outside its declared permissions even by bypassing the soft Layer._

- [ ] Blueprints' `plan` Effects execute in a worker with no ambient `node:fs`
- [ ] `BlueprintFileSystem` calls marshalled across the worker boundary, still permission-gated
- [ ] The interface to blueprint authors is unchanged (transparent swap from the soft sandbox)
- [ ] The lint-time `node:*` ban remains as defense-in-depth
  > Size: L · multi-PR

---

## Epic: Interactive docs & demo

### DEMO-1 — In-browser `pjt` demo on the marketing site

_As a prospective user, I want to run `pjt inspect` against a fake project in the browser, so that I can feel the drift-detection loop before installing._

- [ ] `@projitect/test-kit`'s in-memory FS compiled to ESM and driven from the site via Vite
- [ ] A live editor: edit a `.pjt.ts`, see the plan + drift output update
- [ ] Runs entirely client-side (core stays runtime-pure — no `node:*`)
  > Size: L · multi-PR

---

## Epic: Contributor documentation (docs/)

Repo-level docs for people working **on** projitect — distinct from the end-user marketing site
under `apps/website`. The first file (`docs/agents-signing.md`) shipped with the commit-signing
setup; this epic fills out the rest.

### DOCS-1 — Seed getting-started, architecture, and publishing-pipeline docs

_As a new contributor, I want `docs/` to explain how to build, how the codebase fits together, and how releases publish, so that I can ramp without reverse-engineering the repo._

- [ ] `docs/getting-started.md` — clone → `nvm use` → `pnpm install` → `pnpm check-all`; running `pjt` locally against a scratch project; where `scripts/smoke.sh` fits
- [ ] `docs/architecture.md` — the package graph (`core` → `blueprint` → `cli-internals` → `projitect`; `test-kit`; the `blueprint-*` set), the load → plan → diff → apply pipeline, the four ownership modes, the `.pjt.lock` model, and the soft sandbox
- [ ] `docs/publishing.md` — the lockstep changeset flow, `release.yml`, what publishes to npm vs the docs site, and the OPS prerequisites (npm scope/OIDC, Vercel)
- [ ] Cross-link from AGENTS.md (and a root README, if/when one lands); keep these contributor docs separate from `apps/website`
  > Depends on: `docs/agents-signing.md` (shipped) · Size: M

---

## Epic: Polish & ergonomics

### DX-1 — Publish a JSON Schema for `pjt inspect --json`

_As a CI author, I want a versioned JSON Schema for the `--json` output, so that I can typecheck a consumer of the drift report._

- [ ] Schema published (in-repo + linked from `docs/cli/inspect.mdx`)
- [ ] A test asserts the live `--json` output validates against it
  > Size: S

### DX-2 — `pjt add` picker pre-selects recommended defaults

_As a user, I want the interactive section picker to pre-check the blueprint's recommended sections, so that the common case is one keystroke._

- [ ] Blueprint metadata can mark sections `recommended`
- [ ] `Prompt.multiSelect` shows those pre-selected
  > Depends on: ARG-1 (metadata shape) · Size: S

### DX-3 — `tsconfig()` models `references`

_As a user in a project-references monorepo, I want `tsconfig({ references: [...] })`, so that I don't have to drop to a `tsconfig.local.json` for the common monorepo case._

- [ ] `references` option emits the `references` array
- [ ] Docs example updated; the "overrides" escape hatch note narrowed
  > Size: S

### DX-4 — Brace-expansion in permission globs

_As an author, I want `{a,b}` brace expansion in permission globs, so that I can declare `src/**/*.{ts,tsx}` without two entries._

- [ ] Glob matcher supports brace alternation
- [ ] Unit tests over the new cases
  > Size: S

---

## Epic: Security & maintenance

### SEC-1 — Triage the open Dependabot alerts

_As a maintainer, I want the 4 Dependabot alerts on the default branch resolved, so that the repo's security tab is clean before the first release._

- [ ] Review the 4 alerts surfaced on push (2 moderate, 2 low) at the repo's Dependabot tab
- [ ] Bump / override the affected transitive deps (Renovate may cover some once OPS-7 lands)
- [ ] Confirm the alerts clear; note any that are dev-only / not exploitable in a published library
  > Depends on: OPS-7 (Renovate may auto-fix some) · Size: S

---

## Shipped (v0 → v0.3)

A record of what's already in code, checked off. Detail lives in git history on `main`; this is
the running ledger so the backlog is a complete picture, not just the pending half.

### v0 — foundations

- [x] pnpm monorepo skeleton — workspace, composite tsconfig project refs, base configs, `.nvmrc` 22.12
- [x] `@projitect/core` — Blueprint / ChangeSet / Permission / ProjitectConfig / PjtLock schemas + the full error catalog (`Schema.TaggedError`, semantic ids)
- [x] `@projitect/blueprint` — region / merge / owned / seed constructors, `directory` scope, detectors, `BlueprintFileSystem` service
- [x] `@projitect/test-kit` — in-memory `BlueprintFileSystem` Layer + `dumpFs`
- [x] `@projitect/cli-internals` — loader, planner, differ, applier, config cascade
- [x] `projitect` (main) + `pjt` bin shim
- [x] `@projitect/blueprint-gitignore` — 8 composable sections
- [x] `apps/website` — Astro Starlight: landing, getting-started, 4 concept pages, 6 CLI refs, authoring, examples, one MDX page per error id

### v0.1 — drift pipeline + Effect CLI

- [x] Node-backed platform Layers (FileSystem / Terminal / Stdio) bundled as `NodePlatformLive`
- [x] `.pjt.lock` schema + read / write / diff
- [x] lockfile-aware plan + remove pipeline (orphan cleanup when a blueprint leaves `.pjt.ts`)
- [x] projitect bootstrap blueprint + `pjt()` auto-prepend (no "implicit" concept in code)
- [x] `Command.make` CLI tree (init / remodel / inspect / build / explain / add) with `--help` + `--completions`
- [x] `pjt init` reuses the standard plan/apply/lockfile pipeline
- [x] `pjt build --force` — wipe + rebuild with git safety (`--force-dirty`, `--yes`)
- [x] `pjt add` — install + `"projitect"` metadata-driven `.pjt.ts` splice
- [x] AGENTS.md: marketing-site coordination + lockstep versioning rules + `release-bump` skill
- [x] docs sync sweep; end-to-end smoke script

### v0.1 — tooling & CI

- [x] ESLint absorbs Prettier (flat config, unicorn recommended, `eslint-plugin-package-json`)
- [x] husky + lint-staged pre-commit
- [x] Renovate config (js-lib semantics + exact-pin for the private root / website)
- [x] GitHub Actions CI — 10 jobs, composite setup action, build-once + artifact share, `publish --dry-run`
- [x] Effect language-service `patch` on `prepare`
- [x] per-package sandbox import bans (`node:*`, `@effect/platform` FileSystem) via `no-restricted-imports`
- [x] "Reach for ESLint first" AGENTS guidance

### v0.2

- [x] regression suites — region / plan / remover / lockfile / differ / edit-pjt (~77 tests) + `@vitest/eslint-plugin`
- [x] `@projitect/blueprint-vitest` — merge + owned + region in one composite blueprint, + tests + smoke
- [x] `pjt inspect --json` — structured `{ hasDrift, files, removals, upgrades }`, exit 1 on drift
- [x] `pjt init --yes` — auto-bootstrap missing `.git/` + `package.json`
- [x] `pjt add` interactive section picker (`Prompt.multiSelect`, TTY-aware)

### v0.3

- [x] `@projitect/blueprint-tsconfig` — strict-defaults owned `tsconfig.json` + tests + smoke
- [x] CI Node 22 + 24 matrix on typecheck / test / smoke
- [x] `commentSuffix` threaded through the region pipeline (schema → applier / remover / differ / plan), backwards-compatible lockfile decode
- [x] `markdownSection` + `ignoreSection` SDK helpers; `blueprint-gitignore` refactored onto `ignoreSection`
- [x] this `BACKLOG.md`

### Operational (this session)

- [x] git remote moved `projitect/projitect` → `StoryCut/projitect`
- [x] PR #1 (`v0.1` → `main`, the whole v0–v0.3 body of work) merged
- [x] PR #3 (`docs/backlog`) opened
