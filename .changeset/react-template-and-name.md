---
"@projitect/cli": minor
---

`react()` accepts an optional `{ template, name }` object. `template` is `"react-ts"` (the default,
unchanged) or `"react"` for a JavaScript app (`.jsx` starters, `vite.config.js`, no `tsconfig.json`
or TypeScript devDependencies, `build` is `vite build`). `name` sets the `package.json` name; compose
`directory("my-app", [react({ name: "my-app" })])` to place the app in a folder. Invalid options fail
with the new `pjt.react.invalid-options` error.
