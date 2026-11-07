#!/usr/bin/env node
/**
 * Part of `check:examples`: every workflow example (a `.yml` file under examples/) must look like a
 * GitHub Actions workflow and run `pjt inspect` as a step. A structural check on purpose: it needs no YAML
 * parser, and the marketing copy only promises the shape a reader copies.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const examplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../examples")

const workflowsUnder = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return workflowsUnder(full)
      return entry.name.endsWith(".yml") ? [full] : []
    }),
  )
  return nested.flat()
}

const problemsOf = (source) => {
  const required = [
    [/^name:\s*\S+/mu, "a top-level `name:`"],
    [/^on:/mu, "a top-level `on:` trigger"],
    [/^jobs:/mu, "a top-level `jobs:` block"],
    [/^\s+steps:/mu, "a `steps:` list"],
    [/^\s+-\s+run:\s+.*\bpjt inspect\b/mu, "a `- run:` step that runs `pjt inspect`"],
  ]
  const missing = required.filter(([pattern]) => !pattern.test(source)).map(([, what]) => what)
  return /\t/u.test(source) ? [...missing, "spaces, not tabs, for indentation"] : missing
}

const files = await workflowsUnder(examplesDir)
const failures = []
for (const file of files) {
  const missing = problemsOf(await fs.readFile(file, "utf8"))
  if (missing.length > 0) failures.push(`${path.relative(examplesDir, file)}: needs ${missing.join(", ")}`)
}

if (files.length === 0) failures.push("no workflow examples (*.yml) found under examples/")
if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}
console.log(`All ${files.length} workflow example(s) look like workflows that run pjt inspect.`)
