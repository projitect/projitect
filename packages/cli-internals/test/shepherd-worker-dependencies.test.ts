import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { afterEach, beforeEach, expect, it } from "vitest"
import { planBlueprintFile } from "../src/worker/host.js"

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pjt-worker-dep-review-")))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const writePackage = async (
  directory: string,
  manifest: Record<string, unknown>,
  source: string,
) => {
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ type: "module", exports: "./index.js", ...manifest }),
  )
  await fs.writeFile(path.join(directory, "index.js"), source)
}

it.each([false, true])(
  "loads an installed optional dependency (duplicate declaration: %s)",
  async (alsoDependency) => {
    await writePackage(
      path.join(root, "node_modules", "optional-holder"),
      {
        name: "optional-holder",
        optionalDependencies: { "optional-leaf": "*" },
        ...(alsoDependency ? { dependencies: { "optional-leaf": "*" } } : {}),
      },
      'import value from "optional-leaf"; export default value',
    )
    await writePackage(
      path.join(root, "node_modules", "optional-leaf"),
      { name: "optional-leaf" },
      'export default "installed"',
    )
    await fs.writeFile(
      path.join(root, ".pjt.ts"),
      'import value from "optional-holder"; if (value !== "installed") throw new Error(value); export default { _tag: "ProjitectConfig", blueprints: [] }',
    )
    expect(
      await Effect.runPromise(planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: root })),
    ).toEqual([])
  },
)

it("keeps two instances of the same package bound to their distinct peer contexts", async () => {
  await Promise.all(
    ["a", "b"].map(async (context) => {
      const modules = path.join(root, "store", context, "node_modules")
      await writePackage(
        path.join(modules, "same-package"),
        { name: "same-package", version: "1.0.0", peerDependencies: { "peer-leaf": "*" } },
        'import peer from "peer-leaf"; export default peer',
      )
      await writePackage(
        path.join(modules, "peer-leaf"),
        { name: "peer-leaf", version: context === "a" ? "1.0.0" : "2.0.0" },
        `export default ${JSON.stringify(context)}`,
      )
      const holder = path.join(root, "node_modules", `holder-${context}`)
      await writePackage(
        holder,
        { name: `holder-${context}`, dependencies: { "same-package": "1.0.0" } },
        'export { default } from "same-package"',
      )
      await fs.mkdir(path.join(holder, "node_modules"))
      await fs.symlink(
        path.join(modules, "same-package"),
        path.join(holder, "node_modules", "same-package"),
      )
    }),
  )
  await fs.writeFile(
    path.join(root, ".pjt.ts"),
    'import a from "holder-a"; import b from "holder-b"; if (a !== "a" || b !== "b") throw new Error([a, b].join()); export default { _tag: "ProjitectConfig", blueprints: [] }',
  )
  expect(
    await Effect.runPromise(planBlueprintFile({ blueprintFile: ".pjt.ts", projectRoot: root })),
  ).toEqual([])
})
