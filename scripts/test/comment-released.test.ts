import { describe, expect, it } from "vitest"
import {
  MAX_PULL_REQUESTS,
  commentBody,
  parseVersion,
  previousTag,
  run,
} from "../comment-released.js"
import type { GithubClient } from "../comment-released.js"

const makeFake = (
  options: {
    readonly prs?: Record<string, readonly number[]>
    readonly issues?: Record<number, readonly number[]>
    readonly failOn?: readonly number[]
  } = {},
) => {
  const comments = new Map<number, string[]>()
  const client: GithubClient = {
    prsForCommit: (sha) => Promise.resolve(options.prs?.[sha] ?? []),
    closingIssues: (pullRequest) => Promise.resolve(options.issues?.[pullRequest] ?? []),
    listComments: (target) => Promise.resolve(comments.get(target) ?? []),
    postComment: (target, body) => {
      if (options.failOn?.includes(target) === true) {
        return Promise.reject(new Error("404"))
      }
      comments.set(target, [...(comments.get(target) ?? []), body])
      return Promise.resolve()
    },
  }
  return { client, comments }
}

const base = {
  version: "1.2.3",
  commits: ["a", "b"],
  prs: { a: [10], b: [11] },
  issues: { 10: [5], 11: [] },
}

describe("parseVersion", () => {
  it("takes the version of the first published package", () => {
    expect(
      parseVersion('[{"name":"projitect","version":"1.2.3"},{"name":"x","version":"1.2.3"}]'),
    ).toBe("1.2.3")
  })

  it("returns undefined when nothing was published", () => {
    expect(parseVersion("[]")).toBeUndefined()
  })
})

describe("previousTag", () => {
  const tags = ["projitect@1.2.3", "projitect@1.2.2", "projitect@1.2.1"]

  it("finds the tag after the released one", () => {
    expect(previousTag(tags, "1.2.3")).toBe("projitect@1.2.2")
  })

  it("falls back to the newest other tag when the release tag is missing", () => {
    expect(previousTag(["projitect@1.2.2"], "1.2.3")).toBe("projitect@1.2.2")
  })

  it("returns undefined for a first release", () => {
    expect(previousTag(["projitect@1.2.3"], "1.2.3")).toBeUndefined()
  })
})

describe("run", () => {
  it("comments on PRs and the issues they close", async () => {
    const { client, comments } = makeFake(base)
    const result = await run({ ...base, client, dryRun: false, log: () => undefined })
    expect(result.posted).toEqual([10, 11, 5])
    expect(comments.get(5)).toEqual([commentBody("1.2.3")])
    expect(commentBody("1.2.3")).toContain("v1.2.3")
  })

  it("posts nothing on a second run for the same version", async () => {
    const { client, comments } = makeFake(base)
    const options = { ...base, client, dryRun: false, log: () => undefined }
    await run(options)
    const second = await run(options)
    expect(second.posted).toEqual([])
    expect(second.skipped).toEqual([10, 11, 5])
    expect(comments.get(10)).toHaveLength(1)
  })

  it("logs a failed post and still attempts the rest", async () => {
    const { client, comments } = makeFake({ ...base, failOn: [10] })
    const logs: string[] = []
    const result = await run({ ...base, client, dryRun: false, log: (m) => logs.push(m) })
    expect(result.failed).toEqual([10])
    expect(result.posted).toEqual([11, 5])
    expect(comments.has(10)).toBe(false)
    expect(logs.some((line) => line.includes("#10") && line.includes("failed"))).toBe(true)
  })

  it("posts nothing in dry-run mode", async () => {
    const { client, comments } = makeFake(base)
    const logs: string[] = []
    const result = await run({ ...base, client, dryRun: true, log: (m) => logs.push(m) })
    expect(result.posted).toEqual([])
    expect(comments.size).toBe(0)
    expect(logs.filter((line) => line.includes("dry run"))).toHaveLength(3)
  })

  it("caps the number of PRs commented", async () => {
    const commits = Array.from({ length: MAX_PULL_REQUESTS + 5 }, (_, i) => `c${i}`)
    const prs = Object.fromEntries(commits.map((sha, i) => [sha, [i + 1]]))
    const { client } = makeFake({ prs })
    const result = await run({
      version: "1.2.3",
      commits,
      client,
      dryRun: false,
      log: () => undefined,
    })
    expect(result.posted).toHaveLength(MAX_PULL_REQUESTS)
  })
})
