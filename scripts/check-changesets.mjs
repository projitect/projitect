// Rejects pending changesets that name a package absent from the pnpm workspace.
// `changeset status` can't do this alone: it also fails when packages changed without a changeset
// (docs-only PRs, version PRs), which is a policy this gate deliberately leaves out. The release
// plan assembly throws on unknown package names and needs no git history.
// Usage: node scripts/check-changesets.mjs
import process from "node:process"
import getReleasePlan from "@changesets/get-release-plan"

try {
  const plan = await getReleasePlan(process.cwd())
  process.stdout.write(`changesets ok: ${plan.changesets.length} pending\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
