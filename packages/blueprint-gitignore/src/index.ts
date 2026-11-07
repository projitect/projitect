/**
 * @projitect/blueprint-gitignore
 *
 * Eight composable `.gitignore` sections. Each function returns a region-mode blueprint that
 * owns its named section between `# pjt:gitignore:<name> start` and `# pjt:gitignore:<name> end`
 * markers — so multiple sections coexist in the same `.gitignore` file without stepping on each
 * other, and a CI run of `pjt inspect` catches any hand-edit drift.
 *
 * Templates are sourced from https://github.com/github/gitignore (MIT-licensed). Use only the
 * ones you need; this package does not assume one-size-fits-all.
 */

import { ignoreSection } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }
import * as templates from "./templates.js"

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` without a hand-edited constant. JSON import keeps this runtime-pure.
const PACKAGE_VERSION = manifest.version

// Built on `ignoreSection` from the SDK rather than `regionFile` directly — the name documents
// intent, and any future enhancement to ignore-style fencing (e.g. dedup-aware merging) lands
// in one place. On-disk output is byte-identical to the old direct-`regionFile` shape.
const makeSection = (name: string, content: string): Blueprint.Blueprint =>
  ignoreSection({
    id: `pjt:gitignore:${name}`,
    version: PACKAGE_VERSION,
    description: `gitignore section for ${name}`,
    path: ".gitignore",
    content,
  })

export const gitignores = {
  macOs: (): Blueprint.Blueprint => makeSection("macos", templates.macOs),
  windows: (): Blueprint.Blueprint => makeSection("windows", templates.windows),
  linux: (): Blueprint.Blueprint => makeSection("linux", templates.linux),
  node: (): Blueprint.Blueprint => makeSection("node", templates.node),
  next: (): Blueprint.Blueprint => makeSection("next", templates.next),
  vscode: (): Blueprint.Blueprint => makeSection("vscode", templates.vscode),
  jetbrains: (): Blueprint.Blueprint => makeSection("jetbrains", templates.jetbrains),
  tsbuildinfo: (): Blueprint.Blueprint => makeSection("tsbuildinfo", templates.tsbuildinfo),
} as const

export type GitignoreSection = keyof typeof gitignores
