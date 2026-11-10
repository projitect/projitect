// Guards the agent guidance itself (adapted from ampm's setup/check-guidance.mjs):
//   - CLAUDE.md is a symlink to AGENTS.md, and AGENTS.md stays a short index
//   - every relative link and heading anchor in AGENTS.md, docs/ and .claude/skills/ resolves
//   - every page under docs/ is linked from docs/README.md
//   - every skill has `name` (equal to its directory) and `description` frontmatter
// Usage: node scripts/check-guidance.mjs [repo-root]
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises"
import { Buffer } from "node:buffer"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const MAX_BYTES = 24 * 1024
const WARN_LINES = 400
const SKILLS_DIR = ".claude/skills"

const markdownLinks = (body) =>
  Array.from(body.matchAll(/\[[^\]]+\]\((?<target>[^)\s]+)\)/gu), (match) => match.groups.target)

// GitHub-style heading slug
const slug = (heading) =>
  heading
    .toLowerCase()
    .replaceAll(/\[(?<text>[^\]]+)\]\([^)]+\)/gu, "$<text>")
    .replaceAll(/[`*_~]/gu, "")
    .replaceAll(/[^\p{L}\p{N} -]/gu, "")
    .replaceAll(" ", "-")

const frontmatter = (body) => {
  const block = /^---\n(?<fields>[\s\S]*?)\n---\n/u.exec(body)?.groups.fields
  return block === undefined
    ? {}
    : Object.fromEntries(
        Array.from(block.matchAll(/^(?<key>[\w-]+):\s*(?<value>.+)$/gmu), (match) => [
          match.groups.key,
          match.groups.value.trim(),
        ]),
      )
}

const exists = (target) =>
  stat(target).then(
    () => true,
    () => false,
  )

const markdownFiles = async (directory) => {
  if (!(await exists(directory))) {
    return []
  }
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return markdownFiles(entryPath)
      }
      return entryPath.endsWith(".md") ? [entryPath] : []
    }),
  )
  return nested.flat()
}

const checkLink = async (root, file, link) => {
  if (/^(?:https?:|mailto:)/u.test(link)) {
    return []
  }
  const [linkPath, fragment] = link.split("#")
  const target = linkPath === "" ? file : path.resolve(path.dirname(file), decodeURI(linkPath))
  const where = path.relative(root, file)
  if (!(target === root || target.startsWith(root + path.sep))) {
    return [`${where}: link escapes the repository: ${link}`]
  }
  if (!(await exists(target))) {
    return [`${where}: broken link: ${link}`]
  }
  if (fragment === undefined || !target.endsWith(".md")) {
    return []
  }
  const targetBody = await readFile(target, "utf8")
  const headings = Array.from(targetBody.matchAll(/^#{1,6}\s+(?<title>.+)$/gmu), (match) =>
    slug(match.groups.title),
  )
  return headings.includes(fragment) ? [] : [`${where}: missing anchor: ${link}`]
}

const checkSkill = async (root, file) => {
  const meta = frontmatter(await readFile(file, "utf8"))
  const name = path.relative(path.join(root, SKILLS_DIR), path.dirname(file))
  const where = path.relative(root, file)
  return [
    ...(meta.name === name ? [] : [`${where}: frontmatter name must be "${name}"`]),
    ...(meta.description === undefined ? [`${where}: missing frontmatter description`] : []),
  ]
}

export const checkGuidance = async (root) => {
  const agentsPath = path.join(root, "AGENTS.md")
  const manifest = await readFile(agentsPath, "utf8")
  const lines = manifest.split("\n").length - 1
  const bytes = Buffer.byteLength(manifest)

  const claude = path.join(root, "CLAUDE.md")
  const claudeStat = await lstat(claude)
  const isLinked =
    claudeStat.isSymbolicLink() && (await realpath(claude)) === (await realpath(agentsPath))

  const docs = await markdownFiles(path.join(root, "docs"))
  const skills = await markdownFiles(path.join(root, SKILLS_DIR))

  const indexPath = path.join(root, "docs/README.md")
  const indexed = new Set(
    markdownLinks(await readFile(indexPath, "utf8")).map((link) =>
      path.resolve(path.dirname(indexPath), link.split("#")[0]),
    ),
  )

  const linkErrors = await Promise.all(
    [agentsPath, ...docs, ...skills].map(async (file) => {
      const links = markdownLinks(await readFile(file, "utf8"))
      const perLink = await Promise.all(links.map((link) => checkLink(root, file, link)))
      return perLink.flat()
    }),
  )
  const skillErrors = await Promise.all(
    skills
      .filter((file) => file.endsWith(`${path.sep}SKILL.md`))
      .map((file) => checkSkill(root, file)),
  )

  const errors = [
    ...(bytes > MAX_BYTES ? [`AGENTS.md exceeds ${MAX_BYTES} bytes (${bytes})`] : []),
    ...(isLinked ? [] : ["CLAUDE.md must be a symlink to AGENTS.md"]),
    ...docs
      .filter((page) => page !== indexPath && !indexed.has(page))
      .map((page) => `${path.relative(root, page)} is not linked from docs/README.md`),
    ...linkErrors.flat(),
    ...skillErrors.flat(),
  ]
  const warnings = lines > WARN_LINES ? [`AGENTS.md is ${lines} lines; keep it a short index`] : []
  return { errors, warnings }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? path.join(path.dirname(process.argv[1]), ".."))
  const { errors, warnings } = await checkGuidance(root)
  const report = [
    ...warnings.map((warning) => `warning: ${warning}\n`),
    ...errors.map((error) => `error: ${error}\n`),
  ]
  process.stderr.write(report.join(""))
  process.exitCode = errors.length > 0 ? 1 : 0
}
