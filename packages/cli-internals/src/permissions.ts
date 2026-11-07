import { Array } from "effect"
import type { Permission } from "@projitect/core"

/**
 * Finds the `}` closing the group opened at `open`, and the top-level comma positions between them.
 * Returns `undefined` when the group is unbalanced or has no top-level comma (so `{a}` stays literal).
 */
const parseBraceGroup = (
  glob: string,
  open: number,
): { readonly close: number; readonly commas: readonly number[] } | undefined => {
  const commas: number[] = []
  let depth = 0
  for (let index = open; index < glob.length; index++) {
    const ch = glob.charAt(index)
    if (ch === "{") {
      depth++
    } else if (ch === "}") {
      depth--
      if (depth === 0) {
        return Array.isArrayNonEmpty(commas) ? { close: index, commas } : undefined
      }
    } else if (ch === "," && depth === 1) {
      commas.push(index)
    }
  }
  return undefined
}

/**
 * Minimal glob matcher for permission globs. Supports asterisk (any non-slash chars), double
 * asterisk (any chars including slashes) and `{a,b}` alternation (alternatives may be empty or
 * nested). A brace group needs a closing brace and at least one top-level comma; otherwise the
 * braces and commas match literally. No character classes, `?`, negation or extglobs.
 *
 * Examples that match `src/(double-star)/*.{ts,tsx}`: `src/a.ts`, `src/foo/b.tsx`.
 */
const globToPattern = (glob: string): string => {
  let pattern = ""
  for (let index = 0; index < glob.length; index++) {
    const ch = glob.charAt(index)
    const group = ch === "{" ? parseBraceGroup(glob, index) : undefined
    if (group !== undefined) {
      const bounds = [index, ...group.commas, group.close]
      const alternatives = Array.zipWith(bounds, bounds.slice(1), (start, end) =>
        globToPattern(glob.slice(start + 1, end)),
      )
      pattern = `${pattern}(?:${alternatives.join("|")})`
      index = group.close
    } else if (ch === "*" && glob.charAt(index + 1) === "*") {
      pattern = `${pattern}.*`
      index++
    } else if (ch === "*") {
      pattern = `${pattern}[^/]*`
    } else if (".+^${}()|[]\\".includes(ch)) {
      pattern = `${pattern}\\${ch}`
    } else {
      pattern = pattern + ch
    }
  }
  return pattern
}

const globToRegex = (glob: string): RegExp => new RegExp(`^${globToPattern(glob)}$`, "u")

const matchesGlob = (path: string, glob: string): boolean => globToRegex(glob).test(path)

export type FsOp = "read" | "write" | "exists" | "remove" | "mkdir" | "listDir"

const opCategory = (op: FsOp): "read" | "write" =>
  op === "read" || op === "exists" || op === "listDir" ? "read" : "write"

/**
 * Returns `true` if the declared permissions cover the requested operation on the given path.
 * `read`-permissioned globs cover `read | exists | listDir`. `write`-permissioned globs cover all
 * write-side operations (`write | remove | mkdir`) **and implicitly** the read operations on the
 * same path — a blueprint that writes a file naturally needs to read it back for region updates.
 */
export const isPermitted = (
  permissions: readonly Permission.Permission[],
  op: FsOp,
  path: string,
): boolean => {
  const category = opCategory(op)
  // A permission grants the op when its glob matches and it's a write (writes imply reads) or
  // it's a read covering a read-category op.
  return Array.some(
    permissions,
    (p) =>
      p.kind !== "exec" && matchesGlob(path, p.glob) && (p.kind === "write" || category === "read"),
  )
}

/**
 * Returns `true` if some declared `exec` permission names `command`.
 *
 * Decision: the permission's `command` matches by **exact string** against the full command line —
 * no glob, no normalisation. A glob such as `pnpm *` would let a blueprint run any subcommand,
 * which defeats declaring the permission; exact matching fails closed, so `pnpm lint:fix` is denied
 * when only `pnpm lint` is declared. Relaxing to globs later is additive (the schema stores a plain
 * string). `read`/`write` permissions never grant exec, and `exec` never grants file access.
 */
export const isCommandPermitted = (
  permissions: readonly Permission.Permission[],
  command: string,
): boolean => Array.some(permissions, (p) => p.kind === "exec" && p.command === command)
