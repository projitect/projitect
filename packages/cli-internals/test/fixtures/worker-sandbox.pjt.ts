import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { Effect } from "effect"
import { pjt } from "../../src/loader.js"

const code = (action: () => unknown): string => {
  try {
    action()
    return "allowed"
  } catch (error) {
    return error instanceof Error && "code" in error ? String(error.code) : String(error)
  }
}

// A blueprint whose dependency-like code reaches for the disk and for processes directly.
export default pjt({
  blueprints: [
    {
      id: "pjt:test:worker-sandbox",
      version: "1.0.0",
      permissions: [],
      plan: Effect.sync(() => ({
        operations: [
          {
            _tag: "Owned" as const,
            path: "probe.json",
            ownerId: "pjt:test:worker-sandbox",
            content: JSON.stringify({
              home: code(() => fs.readdirSync(os.homedir())),
              projectTree: code(() =>
                fs.readdirSync(path.resolve(import.meta.dirname, "../../../../..")),
              ),
              spawn: code(() => {
                const result = spawnSync("sh", ["-c", "true"])
                if (result.error) {
                  throw result.error
                }
              }),
            }),
          },
        ],
      })),
    },
  ],
})
