import { Effect } from "effect"
import { Errors } from "@projitect/core"
import { StringX } from "@nunofyobiz/effect-extras"

const IMPORTS_START = "// pjt:imports start"
const IMPORTS_END = "// pjt:imports end"
const BLUEPRINTS_START = "// pjt:blueprints start"
const BLUEPRINTS_END = "// pjt:blueprints end"

/**
 * Splice an import line and one or more blueprint call lines into `.pjt.ts` text using the
 * convention markers. The import goes between `// pjt:imports start/end` (deduped against
 * existing content), the calls go between `// pjt:blueprints start/end` (appended, with 4-space
 * indent to match the standard template). An empty `callLines` leaves the blueprints block alone.
 *
 * Pure string-to-string: the caller owns reading and writing the file. `blueprintFile` is only
 * used to name the file in the error message.
 *
 * Fails with `pjt.add.markers-missing` if either marker pair is missing — the user has
 * hand-edited the file and we won't guess.
 */
export const spliceBlueprintFile = (params: {
  readonly content: string
  readonly blueprintFile: string
  /** Import statement to splice (one line, no trailing newline). Deduped. */
  readonly importLine: string
  /** Blueprint call lines (one entry per line, no leading indent, no trailing newline). */
  readonly callLines: readonly string[]
}): Effect.Effect<string, Errors.AddMarkersMissing> =>
  Effect.gen(function* () {
    const afterImport = yield* spliceImport({
      content: params.content,
      blueprintFile: params.blueprintFile,
      importLine: params.importLine,
    })
    return yield* spliceCalls({
      content: afterImport,
      blueprintFile: params.blueprintFile,
      callLines: params.callLines,
    })
  })

const spliceImport = (params: {
  readonly content: string
  readonly blueprintFile: string
  readonly importLine: string
}): Effect.Effect<string, Errors.AddMarkersMissing> => {
  const { content, blueprintFile, importLine } = params
  return Effect.gen(function* () {
    const lines = content.split("\n")
    const startIndex = lines.findIndex((l) => l.trim() === IMPORTS_START)
    const endIndex = lines.findIndex((l) => l.trim() === IMPORTS_END)
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return yield* new Errors.AddMarkersMissing({
        id: "pjt.add.markers-missing",
        blueprintFile,
        missingMarker: `${IMPORTS_START} / ${IMPORTS_END}`,
        message:
          `${blueprintFile} is missing the \`pjt:imports start\` / \`pjt:imports end\` markers. ` +
          "Restore them (see `pjt init`'s starter template) and re-run `pjt add`.",
      })
    }
    // Dedupe: skip if any line between the markers already equals the import
    const between = lines.slice(startIndex + 1, endIndex).map((l) => l.trim())
    if (between.includes(importLine.trim())) {
      return content
    }
    return StringX.insertBeforeLine(content, endIndex, [importLine])
  })
}

const spliceCalls = (params: {
  readonly content: string
  readonly blueprintFile: string
  readonly callLines: readonly string[]
}): Effect.Effect<string, Errors.AddMarkersMissing> => {
  const { content, blueprintFile, callLines } = params
  return Effect.gen(function* () {
    if (callLines.length === 0) {
      return content
    }
    const lines = content.split("\n")
    const startIndex = lines.findIndex((l) => l.trim() === BLUEPRINTS_START)
    const endIndex = lines.findIndex((l) => l.trim() === BLUEPRINTS_END)
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return yield* new Errors.AddMarkersMissing({
        id: "pjt.add.markers-missing",
        blueprintFile,
        missingMarker: `${BLUEPRINTS_START} / ${BLUEPRINTS_END}`,
        message:
          `${blueprintFile} is missing the \`pjt:blueprints start\` / \`pjt:blueprints end\` markers. ` +
          "Restore them and re-run `pjt add`.",
      })
    }
    const indent = "    " // 4-space, matching the starter template
    const newCalls = callLines.map((c) => `${indent}${c.replace(/^\s+/u, "")}`)
    return StringX.insertBeforeLine(content, endIndex, newCalls)
  })
}
