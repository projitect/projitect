// Comments the published version on every PR in a release and on the issues those PRs close.
// Run by `.github/workflows/release.yml` after changesets publishes; `--dry-run` posts nothing.
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/** Upper bound on PRs commented per release, so a first release (no earlier tag) stays sane. */
export const MAX_PULL_REQUESTS = 50

const TAG_PREFIX = "projitect@"

export interface GithubClient {
  readonly prsForCommit: (sha: string) => Promise<readonly number[]>
  readonly closingIssues: (pullRequest: number) => Promise<readonly number[]>
  readonly listComments: (target: number) => Promise<readonly string[]>
  readonly postComment: (target: number, body: string) => Promise<void>
}

export interface RunOptions {
  readonly client: GithubClient
  readonly version: string
  readonly commits: readonly string[]
  readonly dryRun: boolean
  readonly log: (message: string) => void
}

export interface RunResult {
  readonly posted: readonly number[]
  readonly skipped: readonly number[]
  readonly failed: readonly number[]
}

interface PublishedPackage {
  readonly name: string
  readonly version: string
}

const isPublishedPackage = (value: unknown): value is PublishedPackage =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "version" in value &&
  typeof value.version === "string"

/** All published packages share one version, so the first entry names it. */
export const parseVersion = (publishedPackages: string): string | undefined => {
  const parsed: unknown = JSON.parse(publishedPackages)
  return Array.isArray(parsed) ? parsed.find(isPublishedPackage)?.version : undefined
}

export const markerFor = (version: string): string => `<!-- pjt-release:v${version} -->`

export const commentBody = (version: string): string =>
  `${markerFor(version)}\nShipped in projitect v${version}.`

/** The newest release tag older than `projitect@<version>`; `tags` is newest-first. */
export const previousTag = (tags: readonly string[], version: string): string | undefined => {
  const index = tags.indexOf(`${TAG_PREFIX}${version}`)
  return index === -1 ? tags.find((tag) => tag !== `${TAG_PREFIX}${version}`) : tags[index + 1]
}

const sequentially = async <A, B>(
  items: readonly A[],
  step: (item: A) => Promise<B>,
): Promise<readonly B[]> =>
  items.reduce<Promise<readonly B[]>>(
    async (previous, item) => [...(await previous), await step(item)],
    Promise.resolve([]),
  )

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const unique = (numbers: readonly number[]): readonly number[] => [...new Set(numbers)]

const safely = async <A>(
  log: RunOptions["log"],
  what: string,
  fallback: A,
  work: () => Promise<A>,
): Promise<A> => {
  try {
    return await work()
  } catch (error) {
    log(`warning: ${what} failed: ${describe(error)}`)
    return fallback
  }
}

export const run = async (options: RunOptions): Promise<RunResult> => {
  const { client, version, commits, dryRun, log } = options
  const marker = markerFor(version)

  const prLists = await sequentially(commits, (sha) =>
    safely(log, `PR lookup for ${sha}`, [], () => client.prsForCommit(sha)),
  )
  const allPullRequests = unique(prLists.flat())
  if (allPullRequests.length > MAX_PULL_REQUESTS) {
    log(
      `warning: ${allPullRequests.length} PRs found; commenting on the first ${MAX_PULL_REQUESTS}`,
    )
  }
  const pullRequests = allPullRequests.slice(0, MAX_PULL_REQUESTS)

  const issueLists = await sequentially(pullRequests, (pullRequest) =>
    safely(log, `closing-issue lookup for #${pullRequest}`, [], () =>
      client.closingIssues(pullRequest),
    ),
  )
  const targets = unique([...pullRequests, ...issueLists.flat()])

  const outcomes = await sequentially(targets, async (target) => {
    try {
      const existing = await client.listComments(target)
      if (existing.some((body) => body.includes(marker))) {
        log(`#${target}: already commented for v${version}, skipping`)
        return { target, outcome: "skipped" as const }
      }
      if (dryRun) {
        log(`#${target}: [dry run] would comment "Shipped in projitect v${version}"`)
        return { target, outcome: "skipped" as const }
      }
      await client.postComment(target, commentBody(version))
      log(`#${target}: commented for v${version}`)
      return { target, outcome: "posted" as const }
    } catch (error) {
      log(`warning: commenting on #${target} failed: ${describe(error)}`)
      return { target, outcome: "failed" as const }
    }
  })

  const numbersFor = (wanted: string): readonly number[] =>
    outcomes.filter(({ outcome }) => outcome === wanted).map(({ target }) => target)
  return {
    posted: numbersFor("posted"),
    skipped: numbersFor("skipped"),
    failed: numbersFor("failed"),
  }
}

// ---- Node entry point: real GitHub client + git ----

const git = async (...args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync("git", args)
  return stdout.trim()
}

const gitLines = async (...args: readonly string[]): Promise<readonly string[]> => {
  const output = await git(...args)
  return output.split("\n").filter((line) => line !== "")
}

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set`)
  }
  return value
}

const pick = (value: unknown, ...path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      typeof current === "object" && current !== null && key in current
        ? Object.getOwnPropertyDescriptor(current, key)?.value
        : undefined,
    value,
  )

const COMMENTS_PAGE_SIZE = 100

const bodiesOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((comment: unknown) => {
        const body = pick(comment, "body")
        return typeof body === "string" ? [body] : []
      })
    : []

const numbersOf = (value: unknown): readonly number[] =>
  Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        const number = pick(item, "number")
        return typeof number === "number" ? [number] : []
      })
    : []

/** Issue refs that live in this repository and are closed; cross-repo refs would hit the wrong issue. */
export const sameRepoClosedIssues = (nodes: unknown, repository: string): readonly number[] =>
  Array.isArray(nodes)
    ? nodes.flatMap((node: unknown) => {
        const number = pick(node, "number")
        const state = pick(node, "state")
        const origin = pick(node, "repository", "nameWithOwner")
        return typeof number === "number" &&
          state === "CLOSED" &&
          typeof origin === "string" &&
          origin.toLowerCase() === repository.toLowerCase()
          ? [number]
          : []
      })
    : []

export const makeClient = (
  repository: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): GithubClient => {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  const rest = async (path: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
      ...init,
      headers,
    })
    if (!response.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status}`)
    }
    return response.json()
  }
  const graphql = async (query: string, variables: Record<string, unknown>): Promise<unknown> => {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) {
      throw new Error(`GraphQL -> ${response.status}`)
    }
    return response.json()
  }
  // Walk every page so a marker past the first page is still found; any page error aborts the target.
  const commentBodies = async (
    target: number,
    page: number,
    seen: readonly string[],
  ): Promise<readonly string[]> => {
    const bodies = bodiesOf(
      await rest(`/issues/${target}/comments?per_page=${COMMENTS_PAGE_SIZE}&page=${page}`),
    )
    const all = [...seen, ...bodies]
    return bodies.length < COMMENTS_PAGE_SIZE ? all : commentBodies(target, page + 1, all)
  }

  return {
    prsForCommit: async (sha) => numbersOf(await rest(`/commits/${sha}/pulls`)),
    closingIssues: async (pullRequest) => {
      const [owner = "", name = ""] = repository.split("/")
      const result = await graphql(
        `
          query ($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
              pullRequest(number: $number) {
                closingIssuesReferences(first: 20) {
                  nodes {
                    number
                    state
                    repository {
                      nameWithOwner
                    }
                  }
                }
              }
            }
          }
        `,
        { owner, name, number: pullRequest },
      )
      return sameRepoClosedIssues(
        pick(result, "data", "repository", "pullRequest", "closingIssuesReferences", "nodes"),
        repository,
      )
    },
    listComments: (target) => commentBodies(target, 1, []),
    postComment: async (target, body) => {
      await rest(`/issues/${target}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      })
    },
  }
}

const releaseCommits = async (version: string, head: string): Promise<readonly string[]> => {
  const tags = await gitLines("tag", "--list", `${TAG_PREFIX}*`, "--sort=-v:refname")
  const previous = previousTag(tags, version)
  if (previous === undefined) {
    process.stderr.write("warning: no earlier release tag; using all commits\n")
    return gitLines("rev-list", head)
  }
  return gitLines("rev-list", `${previous}..${head}`)
}

const main = async (): Promise<void> => {
  const dryRun = process.argv.includes("--dry-run") || process.env["DRY_RUN"] === "1"
  const log = (message: string): void => {
    process.stdout.write(`${message}\n`)
  }
  const version = parseVersion(requireEnv("PUBLISHED_PACKAGES"))
  if (version === undefined) {
    log("warning: PUBLISHED_PACKAGES names no package; nothing to comment")
    return
  }
  const repository = requireEnv("GITHUB_REPOSITORY")
  const head = process.env["GITHUB_SHA"] ?? "HEAD"
  await safely(log, "fetching tags", undefined, async () => {
    await git("fetch", "--tags", "--quiet")
  })
  const commits = await releaseCommits(version, head)
  const result = await run({
    client: makeClient(repository, requireEnv("GITHUB_TOKEN")),
    version,
    commits,
    dryRun,
    log,
  })
  log(
    `done: ${result.posted.length} posted, ${result.skipped.length} skipped, ${result.failed.length} failed`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // A comment failure must never fail the publish job, so errors are logged, not rethrown.
  await main().catch((error: unknown) => {
    process.stderr.write(`warning: comment-released failed: ${describe(error)}\n`)
  })
}
