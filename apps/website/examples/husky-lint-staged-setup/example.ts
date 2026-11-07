/**
 * Set up commit-time linting and formatting — the `.husky/pre-commit` hook, the `lint-staged`
 * field, the `prepare` script, and the husky and lint-staged devDependencies, all from one
 * `.pjt.ts` line. Passing `config` replaces the default lint-staged config entirely.
 */
import { pjt } from "projitect/cli"
import { huskyLintStaged } from "@projitect/blueprint-husky-lint-staged"

export default pjt({
  blueprints: [
    huskyLintStaged({
      config: {
        "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
        "*.{json,md}": "prettier --write",
      },
    }),
  ],
})
