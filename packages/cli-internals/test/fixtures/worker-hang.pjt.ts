import { pjt } from "../../src/loader.js"

setInterval(() => undefined, 1000)
await new Promise<void>(() => {
  // Never settles
})

export default pjt({ blueprints: [] })
