/**
 * @projitect/blueprint
 *
 * Authoring SDK for blueprint packages. Blueprint authors compose these primitives — the
 * `BlueprintFileSystem` service for FS access, the four ownership-mode constructors
 * (`regionFile` / `jsonMerge` / `ownFile` / `seedFile`), the section helpers
 * (`markdownSection`, `ignoreSection`), the `directory` scope transform, and detectors for
 * common project introspection.
 *
 * Authors use Effect's own control-flow combinators (`Effect.gen`, `Effect.all`, `Effect.if`,
 * `Effect.when`, `Effect.unless`, `Effect.forEach`) for sequencing and conditionals — we do
 * not ship duplicates.
 */
export * from "./constructors.js"
export * from "./sections.js"
export * from "./directory.js"
export * from "./detect.js"
export * from "./splice.js"
export * from "./add-sections.js"
export { BlueprintFileSystem } from "@projitect/core"
export { Blueprint, ChangeSet, Permission, Errors } from "@projitect/core"
