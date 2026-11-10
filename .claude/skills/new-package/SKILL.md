---
name: new-package
description: Scaffold a new published workspace package under packages/ that matches the existing layout (package.json field order, tsconfig and test tsconfig, root references, lockstep changeset, ESLint sandbox, knip) and passes `pnpm check-all`. Use when adding any package; for blueprints use new-blueprint, which builds on this.
---

# new-package

Models the layout on `packages/blueprint-gitignore` (src only) and `packages/blueprint-changesets`
(src + tests). Replace `<name>` with the directory name; the published name is `@projitect/<name>`.

## Steps

### 1. Create `packages/<name>/package.json`

Field order is enforced by `eslint-plugin-package-json`; dependencies are alphabetized:

```json
{
  "name": "@projitect/<name>",
  "version": "0.0.0",
  "description": "<one line>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/projitect/projitect.git",
    "directory": "packages/<name>"
  },
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "src", "!**/*.tsbuildinfo"],
  "scripts": {
    "build": "tsc --build",
    "build:clean": "tsc --build --clean",
    "tc": "tsc --build"
  },
  "devDependencies": {
    "@projitect/core": "workspace:*",
    "@projitect/test-kit": "workspace:*",
    "effect": "4.0.0-rc.111",
    "typescript": "5.9.3"
  },
  "peerDependencies": {
    "@projitect/core": "workspace:*",
    "effect": "4.0.0-rc.111"
  },
  "engines": {
    "node": ">=22.12.0"
  }
}
```

Set `version` to the current lockstep version (read any other `packages/*/package.json`; `0.0.0` until the
first release). Drop `@projitect/test-kit` if there are no tests; add only the workspace deps the package
really uses (every import must be declared or knip fails).

### 2. Create the tsconfigs

`packages/<name>/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"],
  "references": [{ "path": "../core" }]
}
```

Add a `{ "path": "../<dep>" }` reference per workspace dependency. If the package has tests, copy
`packages/blueprint-changesets/test/tsconfig.json` to `packages/<name>/test/tsconfig.json` (a
composite project that `pnpm tc` typechecks, and that ESLint's project service needs) and keep its
references in line with the deps.

### 3. Add source and tests

- `packages/<name>/src/index.ts` — the public entry; a header doc comment says what the package is.
- `packages/<name>/test/index.test.ts` — Vitest, using `makeInMemoryLayer` from `@projitect/test-kit`.
  Packages have no `test` script; the root Vitest run picks tests up.

Match naming and style of neighbouring packages (kebab-case filenames, Effect-native code, no `as`).

### 4. Wire the workspace

- Root `tsconfig.json`: add `{ "path": "./packages/<name>" }` to `references`, and
  `{ "path": "./packages/<name>/test" }` too when the package has tests — otherwise its tests are
  not typechecked.
- `.changeset/config.json`: the `fixed` group `["projitect", "@projitect/*"]` already covers any
  `@projitect/*` name via the glob. A non-scoped name needs its own entry in `fixed`.
- `README.md` and `AGENTS.md` package tables: add a row (keep the Prettier column alignment).
- ESLint sandbox: `eslint.config.js` already bans `node:*` / `FileSystem` for `packages/blueprint/**`,
  `packages/blueprint-*/**` and `packages/core/**`. A package that must follow the same ban but doesn't
  match those globs needs its own `files:` block (see the `packages/test-kit/**` block).
- knip: `knip.json` needs no entry for a normal package; a package with extra entry files (scripts) does.
- `scripts/smoke.sh`: add the package to the `npm install file:${PKG}/...` list only if it is
  user-facing.

### 5. Install and verify

- `pnpm install` (refreshes `pnpm-lock.yaml`; commit the lockfile change)
- `pnpm build`
- `pnpm check-all`

### 6. Changeset and commit

A new package is a **new public feature → minor**. Add `.changeset/add-<name>.md`:

```md
---
"projitect": minor
---

New `@projitect/<name>` package. <one sentence on what it does>.
```

Commit per [create-commit](../create-commit/SKILL.md): `feat(<name>): add @projitect/<name> package`.
Marketing-site obligations for user-facing packages are in [Marketing site](../../../docs/marketing-site.md); blueprints are
covered by [new-blueprint](../new-blueprint/SKILL.md).
