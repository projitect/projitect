import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { isBuiltin } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import type { Metafile } from "esbuild"
import { describe, expect, it } from "vitest"

/**
 * The browser entries must bundle for the browser with no `node:*` module anywhere in their module
 * graph. Vite and Astro consume the same ESM `exports` as esbuild, so an esbuild browser-platform
 * bundle stands in for both. Node builtins are marked external (rather than letting the build
 * fail) so the metafile can name exactly which module reaches one.
 */

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src")
const testKitEntry = fileURLToPath(import.meta.resolve("@projitect/test-kit"))

const bundle = async (entry: string): Promise<Metafile> => {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "esm",
    logLevel: "silent",
    external: ["node:*"],
  })
  return result.metafile
}

/** Every `file -> specifier` edge in the graph that targets a Node builtin. */
const nodeImports = (metafile: Metafile): readonly string[] =>
  Object.entries(metafile.inputs).flatMap(([file, input]) =>
    input.imports.filter((edge) => isBuiltin(edge.path)).map((edge) => `${file} -> ${edge.path}`),
  )

describe("browser bundles contain no node:* module", () => {
  it.each([
    ["the browser engine entry", path.join(srcDir, "browser.ts")],
    ["the first-party blueprint registry entry", path.join(srcDir, "browser-blueprints.ts")],
    ["@projitect/test-kit", testKitEntry],
  ])("%s", async (_name, entry) => {
    const metafile = await bundle(entry)
    expect(Object.keys(metafile.inputs).length).toBeGreaterThan(1)
    expect(nodeImports(metafile)).toEqual([])
  })

  it("reports a node:* import in a module reachable from the entry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "projitect-browser-bundle-"))
    try {
      await writeFile(
        path.join(dir, "leaf.ts"),
        'import { readFileSync } from "node:fs"\nexport const leak = readFileSync\n',
      )
      await writeFile(path.join(dir, "entry.ts"), 'export { leak } from "./leaf.js"\n')
      const found = nodeImports(await bundle(path.join(dir, "entry.ts")))
      expect(found).toHaveLength(1)
      expect(found[0]).toMatch(/leaf\.ts -> node:fs$/u)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
