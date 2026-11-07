import { Layer, Path } from "effect"
import { FileSystemLive } from "./file-system.js"
import { StdioLive } from "./stdio.js"
import { TerminalLive } from "./terminal.js"

/**
 * The full Node-backed platform Layer satisfying every service `effect/unstable/cli`'s
 * `Command.Environment` declares. Provided by the `pjt` bin shim to `Command.run`.
 *
 * `Path.layer` ships with effect core (POSIX implementation; no IO). `FileSystem`, `Terminal`,
 * and `Stdio` are hand-rolled in sibling files. `ChildProcessSpawner` is intentionally absent —
 * `Command.run` does not consume it for our use cases, and our own shell-out needs (git status,
 * package-manager add) use `node:child_process` directly via `git.ts` / `pm.ts` Effect wrappers.
 * If a future need surfaces, this is where it'll land.
 */
export const NodePlatformLive = Layer.mergeAll(FileSystemLive, TerminalLive, StdioLive, Path.layer)

export { FileSystemLive } from "./file-system.js"
export { StdioLive } from "./stdio.js"
export { TerminalLive } from "./terminal.js"
export {
  runCommand,
  nodeSpawner,
  type ProcessSpawner,
  type CommandOutput,
} from "./process-runner.js"
