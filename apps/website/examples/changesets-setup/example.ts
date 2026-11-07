/**
 * Set up Changesets release tooling — `.changeset/config.json`, the `changeset` and
 * `version-packages` scripts, and the `@changesets/cli` devDependency, all from one `.pjt.ts`
 * line. Options adjust the generated config; anything left out keeps its default.
 */
import { pjt } from "projitect/cli"
import { changesets } from "@projitect/blueprint-changesets"

export default pjt({
  blueprints: [
    changesets({
      baseBranch: "main",
      access: "public",
      ignore: ["@acme/website"],
    }),
  ],
})
