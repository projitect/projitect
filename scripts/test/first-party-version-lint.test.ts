import { Linter } from "eslint"
import { describe, expect, it } from "vitest"
import selectors from "../first-party-version-selectors.json" with { type: "json" }

const lint = (code: string) =>
  new Linter().verify(code, [
    {
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      rules: { "no-restricted-syntax": ["error", ...selectors] },
    },
  ])

describe("first-party version selectors", () => {
  it("flag a literal PACKAGE_VERSION", () => {
    expect(lint('const PACKAGE_VERSION = "1.2.3"')).toHaveLength(1)
  })

  it("flag a literal 0.0.0 version property", () => {
    expect(lint('const op = { version: "0.0.0" }')).toHaveLength(1)
  })

  it("allow the manifest version and explicit version options", () => {
    const code = [
      "const PACKAGE_VERSION = manifest.version",
      "const op = { version: options.version ?? PACKAGE_VERSION }",
      'const skills = { version: "2.1.0" }',
    ].join("\n")
    expect(lint(code)).toHaveLength(0)
  })
})
