/**
 * Starter source and config for the Next.js app. The seeded files are written once and never
 * enforced; `nextConfig` is owned and rewritten on every `remodel`.
 */

export const layoutTsx = `import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Next app",
  description: "Scaffolded by projitect",
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

export const pageTsx = `export default function Page() {
  return (
    <main>
      <h1>Hello from projitect</h1>
      <p>
        Edit <code>src/app/page.tsx</code> to get started.
      </p>
    </main>
  )
}
`

export const pageTestTsx = `import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import Page from "./page"

afterEach(cleanup)

describe("Page", () => {
  it("renders the starter heading", () => {
    render(<Page />)
    expect(screen.getByRole("heading", { name: "Hello from projitect" })).toBeTruthy()
  })
})
`

export const globalsCss = `:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
}

body {
  margin: 0;
  display: grid;
  min-height: 100vh;
  place-items: center;
}
`

export const eslintConfig = `import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts"]),
])
`

export const nextConfig = `import type { NextConfig } from "next"

/**
 * Next.js configuration scaffolded by \`@projitect/blueprint-next\`.
 *
 * Owned mode — projitect rewrites this file on every \`pjt remodel\`.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
`
