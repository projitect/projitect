/** A JavaScript React app in its own folder; run the app's pnpm commands inside my-app. */
import { pjt } from "@projitect/cli"
import { directory } from "@projitect/blueprint"
import { react } from "@projitect/blueprint-react"

export default pjt({
  blueprints: [directory("my-app", [react({ template: "react", name: "my-app" })])],
})
