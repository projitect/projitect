import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { detect } from "../src/pm.js"

let projectRoot: string
beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pjt-pm-test-"))
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await fs.rm(projectRoot, { recursive: true, force: true })
})

describe("package manager detection before the first install", () => {
  it.each(["pnpm", "yarn", "bun", "npm"])(
    "honors the invoking %s without a lockfile",
    async (pm) => {
      vi.stubEnv("npm_config_user_agent", `${pm}/1.0.0 node/v22.12.0`)
      expect(await Effect.runPromise(detect({ projectRoot }))).toBe(pm)
    },
  )
  it("prefers the existing lockfile over the invoking package manager", async () => {
    vi.stubEnv("npm_config_user_agent", "pnpm/10.33.4")
    await fs.writeFile(path.join(projectRoot, "package-lock.json"), "{}")
    expect(await Effect.runPromise(detect({ projectRoot }))).toBe("npm")
  })
  it("retains the npm fallback for an unknown launcher", async () => {
    vi.stubEnv("npm_config_user_agent", "unknown/1.0.0")
    expect(await Effect.runPromise(detect({ projectRoot }))).toBe("npm")
  })
})
