import { Effect, Match } from "effect"
import { Errors } from "@projitect/core"

export interface ParsedPackageSpec {
  /** The user's spec, passed unchanged to the package manager. */
  readonly installSpec: string
  /** The package name, used to read `node_modules/<name>/package.json`. */
  readonly name: string
}

type Reason = Errors.AddSpecUnsupported["reason"]

const SCHEME = /^(?<scheme>[a-z][\d+.a-z-]*):/iu
const TARBALL = /\.(?:tgz|tar\.gz|tar)$/iu
const SEGMENT = /^[\w~][\w.~-]*$/u

const NEXT_STEP =
  "Install it with your package manager, import it in .pjt.ts by hand, then run `pjt remodel`."

const explain = (reason: Reason): string =>
  Match.value(reason).pipe(
    Match.when("empty", () => "The package spec is empty. Pass `pjt add <name>[@<version>]`."),
    Match.when(
      "unsafe-name",
      () =>
        "The package name is not a valid registry name. Pass `<name>` or `@<scope>/<name>`, optionally followed by `@<version | range | tag>`.",
    ),
    Match.when(
      "alias",
      () =>
        `npm aliases are unsupported: the blueprint's own import names the real package, so an alias would not resolve. Add the real package name instead, or ${NEXT_STEP}`,
    ),
    Match.when("url", () => `URL and tarball specs are unsupported. ${NEXT_STEP}`),
    Match.when("file", () => `File and tarball specs are unsupported. ${NEXT_STEP}`),
    Match.when("git", () => `Git specs are unsupported. ${NEXT_STEP}`),
    Match.when("workspace", () => `Workspace and link specs are unsupported. ${NEXT_STEP}`),
    Match.exhaustive,
  )

const reject = (spec: string, reason: Reason) =>
  new Errors.AddSpecUnsupported({
    id: "pjt.add.spec-unsupported",
    spec,
    reason,
    message: `Unsupported package spec \`${spec}\`: ${explain(reason)}`,
  })

const classify = (raw: string): Reason | null => {
  if (raw.length === 0) {
    return "empty"
  }
  if (raw.includes("\\")) {
    return "unsafe-name"
  }
  const scheme = SCHEME.exec(raw)?.groups?.["scheme"]?.toLowerCase()
  if (scheme !== undefined) {
    return Match.value(scheme).pipe(
      Match.whenOr("workspace", "link", () => "workspace" as const),
      Match.when("file", () => "file" as const),
      Match.whenOr("http", "https", () => "url" as const),
      Match.when("npm", () => "alias" as const),
      Match.orElse(() => "git" as const),
    )
  }
  if (raw.includes("@npm:")) {
    return "alias"
  }
  if (TARBALL.test(raw)) {
    return "file"
  }
  if (/^[./~]/u.test(raw)) {
    return "unsafe-name"
  }
  if (!raw.startsWith("@") && raw.includes("/")) {
    // `user/repo` is npm's GitHub shorthand.
    return "git"
  }
  return null
}

const splitName = (raw: string): { readonly name: string; readonly selector: string | null } => {
  const at = raw.indexOf("@", raw.startsWith("@") ? 1 : 0)
  return at === -1
    ? { name: raw, selector: null }
    : { name: raw.slice(0, at), selector: raw.slice(at + 1) }
}

const isValidName = (name: string): boolean => {
  const parts = name.split("/")
  return name.startsWith("@")
    ? parts.length === 2 &&
        parts[0] !== undefined &&
        parts[0].length > 1 &&
        SEGMENT.test(parts[0].slice(1)) &&
        SEGMENT.test(parts[1] ?? "")
    : parts.length === 1 && SEGMENT.test(name)
}

/**
 * Split a `pjt add` argument into the spec the package manager receives and the package name
 * used to read metadata. Selectors (exact versions, ranges, dist-tags) stay in `installSpec`
 * only. Unsupported forms and names that could escape `node_modules` fail before install.
 */
export const parsePackageSpec = (
  raw: string,
): Effect.Effect<ParsedPackageSpec, Errors.AddSpecUnsupported> =>
  Effect.gen(function* () {
    const reason = classify(raw)
    if (reason !== null) {
      return yield* reject(raw, reason)
    }
    const { name, selector } = splitName(raw)
    if (!isValidName(name) || selector === "" || (selector !== null && /[/:\\]/u.test(selector))) {
      return yield* reject(raw, "unsafe-name")
    }
    return { installSpec: raw, name }
  })
