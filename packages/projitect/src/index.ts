/**
 * `@projitect/cli` — the CLI package and project configuration entry point.
 *
 * Project configuration imports `pjt` and `directory` from this entry point. Blueprint authors
 * use `@projitect/blueprint` for the authoring SDK.
 *
 * It also exposes the bootstrap blueprint factory and the programmatic command entry point
 * for tests and embedders.
 */
export { projitectBlueprint } from "./projitect-blueprint.js"
export { pjt, directory } from "./cli.js"
export { rootCommand, type RootCommand } from "@projitect/cli-internals"
