/**
 * Starter source for the React app. Every file here is seeded: written once, never enforced.
 */

export const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

export const mainTsx = `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

const root = document.getElementById("root")
if (root === null) {
  throw new Error("Missing #root element in index.html")
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`

export const appTsx = `import { useState } from "react"

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1>Hello from projitect</h1>
      <button
        type="button"
        onClick={() => {
          setCount((current) => current + 1)
        }}
      >
        Count is {count}
      </button>
    </main>
  )
}
`

export const appTestTsx = `import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import App from "./App"

afterEach(cleanup)

describe("App", () => {
  it("renders the starter heading", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: "Hello from projitect" })).toBeTruthy()
  })

  it("counts button clicks", () => {
    render(<App />)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByText("Count is 1")).toBeTruthy()
  })
})
`

export const indexCss = `:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
}

body {
  margin: 0;
  display: grid;
  min-height: 100vh;
  place-items: center;
}

button {
  font: inherit;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
`

export const viteConfig = `import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * Vite configuration scaffolded by \`@projitect/blueprint-react\`.
 *
 * Owned mode — projitect rewrites this file on every \`pjt remodel\`. Test settings live in
 * \`vitest.config.ts\`, which Vitest prefers over this file.
 */
export default defineConfig({
  plugins: [react()],
})
`
