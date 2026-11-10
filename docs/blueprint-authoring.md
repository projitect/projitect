# Blueprint authoring

Rules for blueprint packages: the sandbox, where the `pjt add` CLI code lives, how a published package declares itself to `pjt add`, region markers, ownership modes, the first-party scope and the error catalog. See also [architecture](./architecture.md).

## Blueprint authoring rules

Packages under `packages/blueprint*/` **must not** import `FileSystem` from `@effect/platform`.
ESLint enforces this. Blueprints use the `BlueprintFileSystem` service from
`@projitect/blueprint`, which wraps the real FS behind a `Permission`-gated interface.

This is our sandbox: blueprints declare what they need (`{ kind: "write", glob: "..." }`) and
`cli-internals` enforces the bounds. `.pjt.ts` and every blueprint's plan run in a child Node
process started with Node's permission model (`packages/cli-internals/src/worker/`): read-only
access to an allowlist computed by the parent, no child-process or worker permission, and every
`BlueprintFileSystem` call marshalled to the parent over IPC. It is accident prevention, not
hostile-code containment — Node's permission model can be bypassed, and network access is not
restricted on Node 22.12–24. The docs must never claim more; see `concepts/sandbox.mdx`.

**Versions come from the manifest.** A first-party blueprint reports its own installed package
version: `import manifest from "../package.json" with { type: "json" }` and
`const PACKAGE_VERSION = manifest.version`, with `rootDir` `"."` and `package.json` in the
package's `tsconfig.json` `include`, so the build emits `dist/package.json` next to `dist/src/`
and `exports` point at `dist/src/index.js`. Changesets only bumps `package.json`, so a literal
version would stay `0.0.0` across upgrades and `pjt inspect` could never report the upgrade.
Explicit `version` options stay (an author-supplied `version` option wins), and
`@projitect/blueprint-skills` takes its author's version by contract. ESLint enforces this: a
`no-restricted-syntax` block over `packages/blueprint-*/src/**` (selectors in
`scripts/first-party-version-selectors.json`, proven by `scripts/test/first-party-version-lint.test.ts`)
rejects a literal `PACKAGE_VERSION` and a literal `version: "0.0.0"`. The smoke script's section 5e
installs two packed versions of the five blueprints and checks the upgrade end to end.

## Where the `pjt add` CLI code lives

Blueprint args are in scope, and the interactive `pjt add` CLI (BACKLOG.md ARG and NPX epics)
splits along the sandbox line:

- **`@projitect/blueprint`** holds the pure definition and Schema contracts — `BlueprintDefinition`,
  `defineBlueprint`, arg introspection — plus the platform-neutral pieces already there
  (`spliceBlueprintFile`, `resolveSections`, `computeSplice`, `chooseSectionsInteractive`). It stays
  free of `node:*` and platform `FileSystem` imports.
- **`@projitect/cli-internals`** holds the Node-backed `runAddCli` and the shared I/O, `.pjt.ts`
  splice, prompt and terminal code. Its package-root export (`runAddCli`) is the documented host
  entrypoint; a blueprint package's bin shim imports it from there, so the shim depends on
  `@projitect/cli-internals`.
- **Dependency direction** runs from `cli-internals` to `@projitect/blueprint` and
  `@projitect/core`, never the reverse, so there is no cycle. No new package is added.
- **No Node-dependent subpath** (such as `@projitect/blueprint/cli`) is allowed in
  `@projitect/blueprint`. The sandbox table and the lint bans for `packages/blueprint/**` and
  `packages/blueprint-*/**` are unchanged.

## How a published blueprint package declares itself

After installing a package, `pjt add` reads the `"projitect"` field of the installed package's
`package.json` (`readProjitectMetadata` in `packages/cli-internals/src/pm.ts`;
`packages/cli-internals/src/commands/add.ts` consumes it). The shape is `ProjitectPackageMetadata`
in `packages/blueprint/src/add-sections.ts`. Today this field is the only way a package tells
`pjt add` how to be spliced into `.pjt.ts`.

| `type`          | Required | Used                                                                                                     |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `blueprint`     | `import` | `call`, the single call line. When `call` is absent a TODO placeholder is spliced.                       |
| `blueprint-set` | `import` | `callTemplate`, where `{section}` is replaced per chosen section (default `{section}()`), and `sections` |

`@projitect/blueprint-gitignore` is a `blueprint-set`: its `callTemplate` is `gitignores.{section}()`
and its `sections` list the available gitignore sections (see its `package.json`). A field whose
`type` is not one of the two values, or whose `import` is not a string, is treated as missing.

**Several blueprints in one package.** Today the only shape is a `blueprint-set`. The user picks
sections interactively when stdin is a TTY, or passes `pjt add <pkg> --section a,b`. With no TTY and
no flag, all sections are added. No `--id` flag exists today.

**Field missing.** The package stays installed and `pjt add` fails with `pjt.add.metadata-missing`.
The user imports the package in `.pjt.ts` by hand and runs `pjt remodel`.

**Package specs.** `pjt add <name>[@<version | range | tag>]` hands the full spec to the package
manager and reads metadata from the bare name. Aliases, URL, tarball, file, git and workspace specs,
and names that could escape `node_modules`, fail with `pjt.add.spec-unsupported` before install.

**Bin ownership.** Only the `@projitect/cli` package ships a bin, the `pjt` binary
(`packages/projitect/package.json`). No blueprint package ships one today. Generated blueprint-package
bins are planned with the `pjt add` CLI work, which will document their ownership.

**Documented later.** The relationship between an exported blueprint definition and this field
(it-d83ef3d8), `--id` selection (it-750a5597), bin shim ownership (it-905f0c34) and where arguments
are validated, with `pjt.blueprint.invalid-args` (it-c647cd1a), are documented by the tasks that
build them.

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

1. Define a new `Schema.TaggedError` class with an `id` field
2. Export it from `packages/core/src/errors/index.ts`
3. Add `apps/website/src/content/docs/errors/<id>.mdx` with **What**, **Why**, **How to fix**
4. `pnpm --filter website check:errors` will catch step 3 if you forget

Also register the id in `ERROR_IDS` and add its blurb to `ERROR_BLURBS` in
`packages/cli-internals/src/commands/explain.ts`. The `new-error-code` skill in `.claude/skills/`
walks through every step (see [Contributor skills](../AGENTS.md#contributor-skills)).

## First-party blueprint scope

This section holds criteria, not a package list; the package table in [AGENTS.md](../AGENTS.md)
lists what exists.

**Inclusion criteria.** A first-party blueprint is general across projects, uses an ownership mode
`pjt inspect` can check for drift, declares narrow permissions, takes its version from the manifest
(see above), has in-memory tests, and ships with its marketing pages (the `new-blueprint` skill).

**Who decides.** The repository owner sets the roadmap and the order; routine implementation of
roadmap items is delegated.

**Compatibility window.** This is existing behaviour, not a new guarantee: every published package
shares one version through changesets (see Versioning in [AGENTS.md](../AGENTS.md)).

**Sequencing.** The owner's order is:

1. Versioned Markdown/AGENTS/README snippets and shareable agent skills.
2. CLI onboarding for people and agents with the full upgrade, swap, remove and drift lifecycle.
   `add`, `remodel` and `inspect` already ship in main. Removing or swapping blueprints means
   editing the blueprint list and running `remodel`; `scripts/smoke.sh` exercises these operations
   (task tk-53de0340 is the implemented proof). The website
   roadmap still lists the onboarding outcome as planned and in progress; that remaining work is
   the roadmap's, not a claim that the lifecycle is unbuilt.
3. React, Next, the wider catalog and lint/format blueprints.

`react` and `next` ship. `husky-lint-staged` ships and manages lint-staged and husky, not ESLint or
Prettier configs. `eslint` is planned (website roadmap, "Planned first-party blueprints") and
`@projitect/blueprint-prettier` (config and `fix`) is planned as CAT-1 in `BACKLOG.md`; neither
package exists yet. The owner has approved the roadmap and delegated routine implementation, so a
planned package needs no further owner decision to be built.

### Markdown snippets

Distributing versioned Markdown snippets is an intended product capability.
`@projitect/blueprint-markdown` touches `AGENTS.md` and `README.md`. Each snippet is a
region-mode `markdownSection` with the owner id `pjt:markdown:<agents|readme>:<name>`. The six
sections are `package-manager`, `verification`, `commits` and `no-destructive-shortcuts` (in
`AGENTS.md`), and `contributing` and `license` (in `README.md`). Each snippet takes optional
`version` and `content` overrides; the version defaults to the package manifest version. An upgrade
changes the version and usually the content, never the owner id.

The CLI's section selectors use the exported factory names: `agentsPackageManager`,
`agentsVerification`, `agentsCommits`, `agentsNoDestructiveShortcuts`, `readmeContributing` and
`readmeLicense`.

`pjt add` with `--section a,b` adds exactly those sections. With no flag on a terminal it prompts.
With no flag and no terminal it adds every section (see `docs/cli/add.mdx` on the website).

### Agent skills

`@projitect/blueprint-skills` exports `skills({ id, version, target?, skills: [{ name, files }] })`.
`files` is keyed by relative path and must include `SKILL.md`. The `id` must be namespaced (such as
`acme:skills`) and the `version` is the author's own; neither is tied to the SDK release. The `pjt add`
default call is `skills({ id: "your-org:your-skills", version: "0.1.0", skills: [] })`, a literal
placeholder authors replace. A missing, non-string or blank `id` or `version` fails with
`pjt.skills.invalid-path`, never a TypeError. Each file is an `ownFile` at
`<target>/<name>/<path>` with `ownedDir` `<target>/<name>`, and the write permission is
`<target>/**`. Invalid input fails with `pjt.skills.invalid-path`: `..` or empty segments,
backslashes, drive letters, glob characters in `target`, and duplicate skill names.

**Skills root.** `.claude/skills` by default, set through the `target` option. `target` is a
validated relative path, so another directory can be named, but nothing discovers it for a given
agent and no agent-specific adapters exist. This guide claims no universal agent-directory support.

### Lifecycle

`remodel` applies changed desired content and records installed blueprint versions in the lockfile.
`inspect` reports version upgrades and flags managed content that differs from the desired files.
A version-only upgrade with identical desired content can report an upgrade while exiting cleanly;
it need not rewrite file bytes. Removing a blueprint removes its managed regions and owned files
through the lockfile. Files a newer skill version stops shipping are removed as orphans. Removing
a skill prunes only that skill's own tree, never the target root or sibling skills.

### Planned adapters

Adapters for other agent directories are planned. No task for them is filed yet. Related board
tasks: tk-ebaefd6e (agent guidance snippet blueprints, including CLAUDE.md as a symlink to
AGENTS.md) and tk-066c8124 (the completed skills blueprint).
