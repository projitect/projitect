import { Reducer, Schema } from "effect"

/**
 * `ProjitectConfig` resolves through a four-layer reducer:
 *
 *   defaults → env (`PJT_*`) → `.pjt.ts` `config:` field → CLI args
 *
 * Each layer's value is a partial config; layers later in the chain override earlier ones. The
 * final resolved value is what every command consumes.
 */
export const ProjitectConfig = Schema.Struct({
  /** Absolute path to the project root. Hosts supply their root; the portable default is `/`. */
  projectRoot: Schema.String,
  /** Path to the user's blueprint file, relative to projectRoot. Defaults to `.pjt.ts`. */
  blueprintFile: Schema.String,
  /** Whether `build` requires a clean git working tree before destroying the project. Default true. */
  requireCleanGit: Schema.Boolean,
  /** Whether to emit JSON output for `inspect` / `remodel` (machine-readable). Default false. */
  jsonOutput: Schema.Boolean,
  /** Verbosity. 0=quiet, 1=normal, 2=verbose, 3=debug. */
  verbosity: Schema.Number,
})

export type ProjitectConfig = typeof ProjitectConfig.Type

export const defaults: ProjitectConfig = {
  projectRoot: "/",
  blueprintFile: ".pjt.ts",
  requireCleanGit: true,
  jsonOutput: false,
  verbosity: 1,
}

/**
 * The config cascade as one algebraic fold: partial layers combine right-biased (a later layer's
 * defined keys win), with the empty config `{}` as the identity — so a missing layer combines as a
 * no-op. This is the universal "merge a list of things" pattern, named once rather than
 * re-implemented per call site.
 */
export const Overrides: Reducer.Reducer<Partial<ProjitectConfig>> = Reducer.make<
  Partial<ProjitectConfig>
>((earlier, later) => ({ ...earlier, ...later }), {})

/**
 * Reduce a list of partial overrides into a single resolved config, applying them left-to-right
 * over the {@link defaults}. Later overrides win.
 */
export const resolve = (...overrides: readonly Partial<ProjitectConfig>[]): ProjitectConfig => ({
  ...defaults,
  ...Overrides.combineAll(overrides),
})
