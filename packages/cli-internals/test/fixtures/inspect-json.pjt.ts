import { ignoreSection } from "@projitect/blueprint"
import { pjt } from "../../src/loader.js"

export default pjt({
  blueprints: [
    ignoreSection({
      id: "pjt:test:inspect-json",
      version: "1.0.0",
      path: ".gitignore",
      content: "dist/\n",
    }),
  ],
})
