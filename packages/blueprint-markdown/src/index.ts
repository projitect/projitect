/**
 * @projitect/blueprint-markdown
 *
 * Six composable Markdown snippets for `AGENTS.md` and `README.md`. Each function returns a
 * region-mode blueprint that owns its named section between `<!-- pjt:markdown:<file>:<name> start -->`
 * and `<!-- pjt:markdown:<file>:<name> end -->` markers — so several snippets coexist in one file,
 * text outside the markers stays yours, and `pjt inspect` catches hand-edits inside them.
 *
 * Owner ids are stable across package versions: an upgrade changes a snippet's `version` and
 * (usually) its content, never its id, so `pjt remodel` rewrites exactly the region that snippet
 * owns. Every snippet takes optional `version` and `content` overrides for forks and tests.
 */

import { markdownSection } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import manifest from "../package.json" with { type: "json" }

// Read the version from the package manifest (emitted next to `dist/src`) so a release bump
// reaches `.pjt.lock` without a hand-edited constant. JSON import keeps this runtime-pure.
const PACKAGE_VERSION = manifest.version

/** Overrides accepted by every snippet. Both are optional. */
export interface SnippetOptions {
  /** Recorded in `.pjt.lock`. Defaults to this package's version. */
  readonly version?: string
  /** Replaces the snippet's default Markdown body. The owner id never changes. */
  readonly content?: string
}

const FILES = {
  agents: { path: "AGENTS.md", slug: "agents" },
  readme: { path: "README.md", slug: "readme" },
} as const

const makeSnippet = (params: {
  readonly file: (typeof FILES)[keyof typeof FILES]
  readonly name: string
  readonly defaultContent: string
  readonly options: SnippetOptions
}): Blueprint.Blueprint => {
  const { file, name, defaultContent, options } = params
  return markdownSection({
    id: `pjt:markdown:${file.slug}:${name}`,
    version: options.version ?? PACKAGE_VERSION,
    description: `${file.path} snippet: ${name}`,
    path: file.path,
    content: options.content ?? defaultContent,
  })
}

const agentsPackageManager = `## Package manager

Use the package manager this project's lockfile names, and no other. Never mix package managers in
one checkout.
`

const agentsVerification = `## Verification

Before claiming a task done, run the project's full check — typecheck, lint and tests — and read the
output. If a check fails, fix the cause; report anything you could not run.
`

const agentsCommits = `## Commits

Write conventional commit subjects (\`feat:\`, \`fix:\`, \`docs:\`, ...). One concept per commit, and
run the full check before pushing.
`

const agentsNoDestructiveShortcuts = `## No destructive shortcuts

When a check fails, fix the root cause. Do not skip or delete tests, silence type errors, or bypass
commit hooks to get a green result.
`

const readmeContributing = `## Contributing

Issues and pull requests are welcome. Read \`AGENTS.md\` for the conventions this project follows
before you open one.
`

const readmeLicense = `## License

See the \`LICENSE\` file in this repository for the license terms.
`

export const markdownSnippets = {
  agentsPackageManager: (options: SnippetOptions = {}): Blueprint.Blueprint =>
    makeSnippet({
      file: FILES.agents,
      name: "package-manager",
      defaultContent: agentsPackageManager,
      options,
    }),
  agentsVerification: (options: SnippetOptions = {}): Blueprint.Blueprint =>
    makeSnippet({
      file: FILES.agents,
      name: "verification",
      defaultContent: agentsVerification,
      options,
    }),
  agentsCommits: (options: SnippetOptions = {}): Blueprint.Blueprint =>
    makeSnippet({
      file: FILES.agents,
      name: "commits",
      defaultContent: agentsCommits,
      options,
    }),
  agentsNoDestructiveShortcuts: (options: SnippetOptions = {}): Blueprint.Blueprint =>
    makeSnippet({
      file: FILES.agents,
      name: "no-destructive-shortcuts",
      defaultContent: agentsNoDestructiveShortcuts,
      options,
    }),
  readmeContributing: (options: SnippetOptions = {}): Blueprint.Blueprint =>
    makeSnippet({
      file: FILES.readme,
      name: "contributing",
      defaultContent: readmeContributing,
      options,
    }),
  readmeLicense: (options: SnippetOptions = {}): Blueprint.Blueprint =>
    makeSnippet({
      file: FILES.readme,
      name: "license",
      defaultContent: readmeLicense,
      options,
    }),
} as const

export type MarkdownSnippet = keyof typeof markdownSnippets
