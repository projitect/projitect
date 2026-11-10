# Blueprint authoring

Rules for blueprint packages: the soft sandbox, where the `pjt add` CLI code lives, how a published package declares itself to `pjt add`, region markers, ownership modes and the error catalog. See also [architecture](./architecture.md).

## Blueprint authoring rules

Packages under `packages/blueprint*/` **must not** import `FileSystem` from `@effect/platform`.
ESLint enforces this. Blueprints use the `BlueprintFileSystem` service from
`@projitect/blueprint`, which wraps the real FS behind a `Permission`-gated interface.

This is our soft sandbox: blueprints declare what they need (`{ kind: "write", glob: "..." }`)
and `cli-internals` enforces the bounds at the Effect layer. A worker-process sandbox is a
tracked follow-up; the interface is designed to swap transparently when we ship it.

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
