/**
 * @projitect/blueprint-changesets
 *
 * One composite blueprint that wires Changesets release tooling into a project:
 *
 *  1. Owns `.changeset/config.json` with the defaults `changeset init` writes. Owned mode —
 *     projitect rewrites this file on every `remodel`, so teams adjust it through options rather
 *     than by hand.
 *  2. Merges the `changeset` / `version-packages` scripts and the `@changesets/cli` devDependency
 *     into `package.json`. Merge mode — non-conflicting with whatever else lives in the file.
 */

import { Effect } from "effect"
import { jsonMerge, ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` without a hand-edited constant. JSON import keeps this runtime-pure.
const PACKAGE_VERSION = manifest.version

const CHANGESETS_CLI_DEP_RANGE = "^2.0.0"
const CONFIG_SCHEMA_URL = "https://unpkg.com/@changesets/config@3.1.1/schema.json"

/**
 * A changelog generator: a package name, a `[name, options]` tuple, or `false` to disable
 * changelog generation.
 */
export type ChangesetsChangelog =
  | string
  | readonly [string, Readonly<Record<string, unknown>>]
  | false

/**
 * Options for the changesets blueprint. All optional; anything not given keeps the default
 * `changeset init` would write.
 */
export interface ChangesetsOptions {
  /** Branch changesets compares against. Defaults to `"main"`. */
  readonly baseBranch?: string
  /** Publish access for packages. Defaults to `"restricted"`. */
  readonly access?: "public" | "restricted"
  /** Groups of packages that always version together. Defaults to none. */
  readonly fixed?: readonly (readonly string[])[]
  /** Groups of packages that share a version when released together. Defaults to none. */
  readonly linked?: readonly (readonly string[])[]
  /** Packages changesets ignores. Defaults to none. */
  readonly ignore?: readonly string[]
  /**
   * Changelog generator. Defaults to the built-in `"@changesets/cli/changelog"`. Any other
   * generator (e.g. `@changesets/changelog-github`) must be installed by the project itself.
   */
  readonly changelog?: ChangesetsChangelog
}

/**
 * Build the composite changesets blueprint. The returned `Blueprint` emits two operations (merge
 * `package.json`, own `.changeset/config.json`), both attributed to `pjt:changesets`.
 */
export const changesets = (options: ChangesetsOptions = {}): Blueprint.Blueprint => {
  const id = "pjt:changesets"

  const packageJsonMerge = jsonMerge({
    id,
    version: PACKAGE_VERSION,
    description: "changesets scripts and @changesets/cli devDependency",
    path: "package.json",
    ownedKeys: ["scripts.changeset", "scripts.version-packages", "devDependencies.@changesets/cli"],
    value: {
      scripts: {
        changeset: "changeset",
        "version-packages": "changeset version",
      },
      devDependencies: {
        "@changesets/cli": CHANGESETS_CLI_DEP_RANGE,
      },
    },
  })

  const config = ownFile({
    id,
    version: PACKAGE_VERSION,
    description: "changesets configuration",
    path: ".changeset/config.json",
    content: renderConfig(options),
  })

  return {
    id,
    version: PACKAGE_VERSION,
    description: "changesets release tooling (config + scripts + devDep)",
    permissions: [
      { kind: "read", glob: "package.json" },
      { kind: "write", glob: "package.json" },
      { kind: "write", glob: ".changeset/config.json" },
    ],
    plan: Effect.gen(function* () {
      const changeSets = yield* Effect.forEach([packageJsonMerge, config], (b) => b.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}

// Key order mirrors what `changeset init` writes, so the output is deterministic.
const renderConfig = (options: ChangesetsOptions): string =>
  `${JSON.stringify(
    {
      $schema: CONFIG_SCHEMA_URL,
      changelog: options.changelog ?? "@changesets/cli/changelog",
      commit: false,
      fixed: options.fixed ?? [],
      linked: options.linked ?? [],
      access: options.access ?? "restricted",
      baseBranch: options.baseBranch ?? "main",
      updateInternalDependencies: "patch",
      ignore: options.ignore ?? [],
    },
    null,
    2,
  )}\n`
