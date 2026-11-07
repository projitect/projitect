import { pjt } from "../../src/loader.js"

// eslint-disable-next-line unicorn/no-process-exit -- the fixture simulates a worker that dies
process.exit(3)

export default pjt({ blueprints: [] })
