import { describe, expect, it } from "vitest"
import type { Permission } from "@projitect/core"
import { isPermitted } from "../src/permissions.js"

const read = (glob: string): readonly Permission.Permission[] => [{ kind: "read", glob }]
const allows = (glob: string, path: string): boolean => isPermitted(read(glob), "read", path)

describe("permission globs: * and **", () => {
  it("lets * match within a segment but not across a slash", () => {
    expect(allows("src/*.ts", "src/a.ts")).toBe(true)
    expect(allows("src/*.ts", "src/x/a.ts")).toBe(false)
  })

  it("lets ** match across slashes", () => {
    expect(allows("src/**/*.ts", "src/x/y/a.ts")).toBe(true)
    expect(allows("src/**/*.ts", "other/a.ts")).toBe(false)
  })

  it("treats brace-free regex-special characters literally", () => {
    expect(allows("a.b", "a.b")).toBe(true)
    expect(allows("a.b", "axb")).toBe(false)
  })
})

describe("permission globs: {a,b} alternation", () => {
  it("grants every alternative and denies others", () => {
    expect(allows("src/*.{ts,tsx}", "src/a.ts")).toBe(true)
    expect(allows("src/*.{ts,tsx}", "src/a.tsx")).toBe(true)
    expect(allows("src/*.{ts,tsx}", "src/a.js")).toBe(false)
  })

  it("combines with ** and keeps * inside the segment", () => {
    expect(allows("src/**/*.{ts,tsx}", "src/a/b/c.tsx")).toBe(true)
    expect(allows("src/*.{ts,tsx}", "src/a/b.ts")).toBe(false)
    expect(allows("{a*,b}.ts", "a/x.ts")).toBe(false)
  })

  it("accepts empty and uneven-length alternatives", () => {
    expect(allows("config{,.local}.json", "config.json")).toBe(true)
    expect(allows("config{,.local}.json", "config.local.json")).toBe(true)
    expect(allows("config{,.local}.json", "config.other.json")).toBe(false)
  })

  it("multiplies several groups", () => {
    const glob = "{src,test}/*.{ts,js}"
    for (const path of ["src/a.ts", "src/a.js", "test/a.ts", "test/a.js"]) {
      expect(allows(glob, path)).toBe(true)
    }
    expect(allows(glob, "lib/a.ts")).toBe(false)
    expect(allows(glob, "src/a.md")).toBe(false)
  })

  it("supports nested groups", () => {
    for (const path of ["a.b", "a.c", "a.d"]) {
      expect(allows("a.{b,{c,d}}", path)).toBe(true)
    }
    expect(allows("a.{b,{c,d}}", "a.e")).toBe(false)
  })

  it("keeps alternation inside the anchors", () => {
    expect(allows("a{b,c}", "xb")).toBe(false)
    expect(allows("a{b,c}", "abx")).toBe(false)
  })

  it("treats regex-special characters in alternatives as literal text", () => {
    expect(allows("x.{a.b,c+d,(e)}", "x.a.b")).toBe(true)
    expect(allows("x.{a.b,c+d,(e)}", "x.axb")).toBe(false)
    expect(allows("x.{a.b,c+d,(e)}", "x.c+d")).toBe(true)
    expect(allows("x.{a.b,c+d,(e)}", "x.ccd")).toBe(false)
    expect(allows("x.{a.b,c+d,(e)}", "x.(e)")).toBe(true)
    expect(allows("x.{a.b,c+d,(e)}", "x.e")).toBe(false)
  })

  it("applies to write permissions too", () => {
    const writes: readonly Permission.Permission[] = [{ kind: "write", glob: "*.{json,md}" }]
    expect(isPermitted(writes, "write", "a.md")).toBe(true)
    expect(isPermitted(writes, "write", "a.ts")).toBe(false)
  })
})

describe("permission globs: braces outside a valid group", () => {
  it("matches a comma-less group literally", () => {
    expect(allows("a{b}", "a{b}")).toBe(true)
    expect(allows("a{b}", "ab")).toBe(false)
  })

  it("matches commas outside a group literally", () => {
    expect(allows("a,b", "a,b")).toBe(true)
    expect(allows("a,b", "a")).toBe(false)
  })

  it("does not throw on an unbalanced open brace and matches it literally", () => {
    expect(() => allows("a{b,c", "a{b,c")).not.toThrow()
    expect(allows("a{b,c", "a{b,c")).toBe(true)
    expect(allows("a{b,c", "ab")).toBe(false)
  })

  it("does not throw on a stray close brace and matches it literally", () => {
    expect(() => allows("a}", "a}")).not.toThrow()
    expect(allows("a}", "a}")).toBe(true)
    expect(allows("a}", "a")).toBe(false)
  })
})
