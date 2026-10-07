import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import mdx from "@astrojs/mdx"

export default defineConfig({
  site: "https://projitect.dev",
  integrations: [
    starlight({
      title: "projitect",
      description:
        "Project scaffolding that stays in sync. Like Terraform, for your frontend repo.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/projitect/projitect" }],
      sidebar: [
        {
          label: "Start here",
          items: [{ autogenerate: { directory: "docs", collapsed: false } }],
        },
        {
          label: "Examples",
          items: [{ autogenerate: { directory: "examples" } }],
        },
        {
          label: "Errors",
          items: [{ autogenerate: { directory: "errors" } }],
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
    mdx(),
  ],
})
