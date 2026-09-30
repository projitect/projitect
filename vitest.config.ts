import { defineConfig } from "vitest/config"

/**
 * Workspace vitest config.
 *
 * The default `include` patterns pick up `**​/*.{test,spec}.{ts,tsx}` across all packages. Suites
 * live under each package's `test/` directory. `passWithNoTests` stays set so a filtered run
 * (e.g. `pnpm test packages/blueprint`) that matches no files still exits zero.
 */
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
})
