import { describe, expect, it } from "vitest"
import { makeClient } from "../comment-released.js"

const json = (body: unknown): Response => Response.json(body)

const makeFetch = (handler: (url: string, init?: RequestInit) => unknown) => {
  const calls: string[] = []
  const fetchImpl: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push(`${init?.method ?? "GET"} ${url}`)
    return Promise.resolve(json(handler(url, init)))
  }
  return { fetchImpl, calls }
}

describe("makeClient listComments", () => {
  it("walks every page so a marker past the first 100 comments is found", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ body: `c${i}` }))
    const { fetchImpl, calls } = makeFetch((url) => {
      if (url.includes("&page=1")) {
        return full
      }
      if (url.includes("&page=2")) {
        return [...full.slice(1), { body: "<!-- pjt-release:v1.2.3 -->" }]
      }
      return []
    })
    const client = makeClient("projitect/projitect", "token", fetchImpl)
    const bodies = await client.listComments(7)
    expect(bodies).toContain("<!-- pjt-release:v1.2.3 -->")
    expect(bodies).toHaveLength(200)
    expect(calls.filter((call) => call.includes("/issues/7/comments"))).toHaveLength(3)
  })

  it("stops after a short page", async () => {
    const { fetchImpl, calls } = makeFetch(() => [{ body: "only" }])
    const client = makeClient("projitect/projitect", "token", fetchImpl)
    expect(await client.listComments(7)).toEqual(["only"])
    expect(calls).toHaveLength(1)
  })
})

describe("makeClient closingIssues", () => {
  const node = (number: number, state: string, nameWithOwner: string) => ({
    number,
    state,
    repository: { nameWithOwner },
  })

  it("keeps only closed issues from the current repository", async () => {
    const { fetchImpl } = makeFetch(() => ({
      data: {
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [
                node(5, "CLOSED", "Projitect/Projitect"),
                node(6, "CLOSED", "other/repo"),
                node(7, "OPEN", "projitect/projitect"),
              ],
            },
          },
        },
      },
    }))
    const client = makeClient("projitect/projitect", "token", fetchImpl)
    expect(await client.closingIssues(10)).toEqual([5])
  })

  it("never posts: only read endpoints are hit", async () => {
    const { fetchImpl, calls } = makeFetch(() => [])
    const client = makeClient("projitect/projitect", "token", fetchImpl)
    await client.prsForCommit("abc")
    await client.listComments(1)
    expect(calls.every((call) => call.startsWith("GET "))).toBe(true)
  })
})
