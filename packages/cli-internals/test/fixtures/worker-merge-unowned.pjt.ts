import { jsonMerge } from "@projitect/blueprint"
import { pjt } from "../../src/loader.js"

export default pjt({
  blueprints: [
    jsonMerge({
      id: "pjt:test:worker-merge",
      version: "1.0.0",
      path: "package.json",
      ownedKeys: ["scripts.test"],
      value: { scripts: { test: "vitest" }, name: "unowned" },
    }),
  ],
})
