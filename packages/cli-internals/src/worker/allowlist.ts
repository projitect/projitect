import { existsSync, readFileSync, realpathSync } from "node:fs"
import { builtinModules } from "node:module"
import path from "node:path"
import { Array, Match, Option, Order, pipe } from "effect"
import { PredicateX } from "@nunofyobiz/effect-extras"

/**
 * The launch flag that enables Node's permission model. Node 22.13 and 23.5 renamed
 * `--experimental-permission` to `--permission`; the 22.12 floor only knows the old name.
 */
export const permissionFlag = (
  nodeVersion: string,
): "--permission" | "--experimental-permission" => {
  const [major = 0, minor = 0] = nodeVersion.split(".").map(Number)
  return Match.value(major).pipe(
    Match.when(
      (m) => m >= 24,
      () => "--permission" as const,
    ),
    Match.when(
      (m) => m === 23 && minor >= 5,
      () => "--permission" as const,
    ),
    Match.when(
      (m) => m === 22 && minor >= 13,
      () => "--permission" as const,
    ),
    Match.orElse(() => "--experimental-permission" as const),
  )
}

/** `@scope/name/sub/path` → `@scope/name`; `name/sub` → `name`; relative paths and builtins → none. */
export const packageNameOf = (specifier: string): Option.Option<string> => {
  const isBare =
    !specifier.startsWith(".") &&
    !specifier.startsWith("/") &&
    !specifier.startsWith("node:") &&
    !builtinModules.includes(specifier)
  const segments = specifier.split("/")
  return isBare
    ? Option.some(specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? ""))
    : Option.none()
}

/** Where a package was found: the `node_modules` entry Node resolves through, and its real path. */
interface PackageLocation {
  readonly link: string
  readonly real: string
}

/** The package `name` as Node would find it when resolving from `fromDir`. */
const findPackageDir = (name: string, fromDir: string): Option.Option<PackageLocation> => {
  const candidate = path.join(fromDir, "node_modules", name)
  const parent = path.dirname(fromDir)
  return existsSync(path.join(candidate, "package.json"))
    ? Option.some({ link: candidate, real: realpathSync(candidate) })
    : parent === fromDir
      ? Option.none()
      : findPackageDir(name, parent)
}

const dependencyNames = (packageDir: string): readonly string[] => {
  const manifest: unknown = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"))
  const section = (key: string): readonly string[] =>
    PredicateX.unsafeIsRecord(manifest) && PredicateX.unsafeIsRecord(manifest[key])
      ? Object.keys(manifest[key])
      : []
  return [...section("dependencies"), ...section("peerDependencies")]
}

/**
 * Locations of `roots` and of everything they pull in through `dependencies` and
 * `peerDependencies`, resolved the way Node resolves them (from each package's real location, so
 * pnpm's symlinked layout works). Dev dependencies are never followed. Both the `node_modules` link
 * and the real directory are listed: Node's resolver reads `package.json` through the link path.
 */
const packageClosure = (roots: readonly PackageLocation[]): ReadonlySet<string> => {
  const reals = new Set<string>()
  const links = new Set<string>()
  const visit = ({ link, real }: PackageLocation): void => {
    links.add(link)
    if (!reals.has(real)) {
      reals.add(real)
      for (const name of dependencyNames(real)) {
        Option.map(findPackageDir(name, real), visit)
      }
    }
  }
  for (const root of roots) {
    visit(root)
  }
  const entries = Array.dedupe([...reals, ...links])
  // Node's permission trie loses an exact grant that is a string prefix of a sibling grant
  // (`…/blueprint` next to `…/blueprint-vitest`), and the resolver needs exactly that grant to
  // `readlink` a symlinked package. A trailing `*` keeps such a link readable, provided the
  // shorter grant is passed first — so the entries are sorted.
  const shadows = (entry: string): boolean =>
    Array.some(
      entries,
      (other) =>
        other !== entry && other.startsWith(entry) && !other.startsWith(`${entry}${path.sep}`),
    )
  return new Set(
    Array.map(entries, (entry) => (links.has(entry) && shadows(entry) ? `${entry}*` : entry)),
  )
}

/** Packages the worker itself imports, resolved from the directory its entry file lives in. */
const workerPackages = [
  "effect",
  "@nunofyobiz/effect-extras",
  "@projitect/core",
  "@projitect/blueprint",
] as const

/**
 * Everything the confined worker may read, as real paths:
 *   - the worker entry's own `dist` directory and its package manifest,
 *   - the dependency closure of `effect`, core, the blueprint SDK and every package the `.pjt.ts`
 *     imports,
 *   - the `.pjt.ts` and the plain-JS module the parent transpiled from it,
 *   - the Node installation prefix.
 * The project tree and `$HOME` are never listed — blueprints reach project files only through the
 * IPC-marshalled `BlueprintFileSystem`.
 */
export const computeReadAllowlist = (params: {
  readonly workerEntry: string
  readonly blueprintFile: string
  readonly moduleFile: string
  readonly imports: readonly string[]
  readonly projectRoot: string
  readonly execPath: string
}): readonly string[] => {
  const { workerEntry, blueprintFile, moduleFile, imports, projectRoot, execPath } = params
  const entryDir = path.dirname(realpathSync(workerEntry))
  const distDir = path.dirname(entryDir)
  const ownManifest = path.join(path.dirname(distDir), "package.json")
  const resolveFrom = [entryDir, path.dirname(blueprintFile), projectRoot]
  const names = pipe(
    imports,
    Array.flatMap((specifier) => Option.toArray(packageNameOf(specifier))),
    (userPackages) => [...workerPackages, ...userPackages],
    Array.dedupe,
  )
  const packageDirs = Array.flatMap(names, (name) =>
    Array.flatMap(Array.dedupe(resolveFrom), (from) => Option.toArray(findPackageDir(name, from))),
  )
  // `<prefix>/bin/node` → `<prefix>`; any other layout → the directory holding the binary.
  const binDir = path.dirname(realpathSync(execPath))
  const nodeInstall = path.basename(binDir) === "bin" ? path.dirname(binDir) : binDir
  return Array.sort(
    Array.dedupe([
      distDir,
      ownManifest,
      ...packageClosure(packageDirs),
      realpathSync(blueprintFile),
      realpathSync(moduleFile),
      nodeInstall,
    ]),
    Order.String,
  )
}
