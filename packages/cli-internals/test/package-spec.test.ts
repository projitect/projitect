import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { Errors } from "@projitect/core"
import { parsePackageSpec } from "../src/package-spec.js"

const reasonOf = async (raw: string) => {
  const exit = await Effect.runPromiseExit(parsePackageSpec(raw))
  if (Exit.isSuccess(exit)) {
    return null
  }
  const error = Cause.squash(exit.cause)
  expect(error).toBeInstanceOf(Errors.AddSpecUnsupported)
  return error instanceof Errors.AddSpecUnsupported ? error.reason : null
}

describe("parsePackageSpec", () => {
  it.each([
    ["name", "name"],
    ["name@1.2.3", "name"],
    ["name@^1", "name"],
    ["name@latest", "name"],
    ["name@>=1.0.0 <2", "name"],
    ["@scope/name", "@scope/name"],
    ["@scope/name@1.2.3", "@scope/name"],
    ["@scope/name@latest", "@scope/name"],
    ["@projitect/blueprint-markdown@1.0.1", "@projitect/blueprint-markdown"],
    ["left-pad.js@~1.3", "left-pad.js"],
  ])("accepts %s and keeps the full install spec", async (raw, name) => {
    await expect(Effect.runPromise(parsePackageSpec(raw))).resolves.toEqual({
      installSpec: raw,
      name,
    })
  })

  it.each([
    ["", "empty"],
    ["..", "unsafe-name"],
    ["../x", "unsafe-name"],
    [".", "unsafe-name"],
    ["/etc/passwd", "unsafe-name"],
    ["~/x", "unsafe-name"],
    [String.raw`a\b`, "unsafe-name"],
    [String.raw`@scope\name`, "unsafe-name"],
    ["@scope", "unsafe-name"],
    ["@scope/", "unsafe-name"],
    ["@/name", "unsafe-name"],
    ["@scope/name/extra", "unsafe-name"],
    ["@scope/..", "unsafe-name"],
    ["name@", "unsafe-name"],
    ["name@../x", "git"],
    ["npm:real@1", "alias"],
    ["alias@npm:real@1", "alias"],
    ["alias@npm:@scope/real@1", "alias"],
    ["https://example.com/x", "url"],
    ["http://example.com/x.tgz", "url"],
    ["./x.tgz", "file"],
    ["x.tar.gz", "file"],
    ["file:../x", "file"],
    ["git+https://github.com/a/b.git", "git"],
    ["git://github.com/a/b.git", "git"],
    ["github:a/b", "git"],
    ["a/b", "git"],
    ["workspace:*", "workspace"],
    ["link:../x", "workspace"],
  ])("rejects %j as %s", async (raw, reason) => {
    expect(await reasonOf(raw)).toBe(reason)
  })
})
