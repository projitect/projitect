import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { Schema } from "effect"

const PackageJson = Schema.Struct({ packageManager: Schema.String })

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")

describe(".ampm/Dockerfile", () => {
  it("pins the pnpm version the root packageManager declares", () => {
    const { packageManager } = Schema.decodeUnknownSync(PackageJson)(
      JSON.parse(read("package.json")),
    )
    const pinned = /^ARG PNPM_VERSION=(?<spec>\S+)$/mu.exec(read(".ampm/Dockerfile"))?.groups?.[
      "spec"
    ]
    expect(pinned).toBeDefined()
    expect(`pnpm@${pinned ?? ""}`).toBe(packageManager.replace(/\+.*$/u, ""))
  })
})
