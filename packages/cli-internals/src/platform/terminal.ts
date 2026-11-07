import * as keypress from "node:readline"
import * as readline from "node:readline/promises"
import { Effect, Layer, Option, Queue, Terminal } from "effect"
import type { Cause } from "effect"
import * as PlatformError from "effect/PlatformError"

/**
 * Node-backed `Terminal` Layer.
 *
 * - `columns` / `rows` read from `process.stdout` (fall back to sensible defaults when not a TTY)
 * - `display(text)` writes to `process.stdout` synchronously
 * - `readLine` uses `node:readline/promises` so `Prompt.text` and `Prompt.confirm` work
 * - `readInput` (the low-level keypress stream used by `Prompt.select` / `Prompt.multiSelect`)
 *   puts a TTY stdin into raw mode for the lifetime of the enclosing scope and queues one
 *   `UserInput` per keypress. Raw mode means Ctrl-C arrives as a keypress rather than as SIGINT,
 *   so Ctrl-C ends the queue and the prompt fails with `QuitError`.
 */
const readInput: Terminal.Terminal["readInput"] = Effect.gen(function* () {
  const queue = yield* Queue.unbounded<Terminal.UserInput, Cause.Done>()
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const onKeypress = (input: string | undefined, key: keypress.Key | undefined): void => {
        Queue.offerUnsafe(queue, {
          input: Option.fromNullishOr(input),
          key: {
            name: key?.name ?? "",
            ctrl: key?.ctrl ?? false,
            meta: key?.meta ?? false,
            shift: key?.shift ?? false,
          },
        })
        if (key?.ctrl === true && key.name === "c") {
          // Raw mode swallows SIGINT; ending the queue makes the prompt fail with `QuitError`.
          Queue.endUnsafe(queue)
        }
      }
      keypress.emitKeypressEvents(process.stdin)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true)
      }
      process.stdin.on("keypress", onKeypress)
      process.stdin.resume()
      return onKeypress
    }),
    (onKeypress) =>
      Effect.sync(() => {
        process.stdin.off("keypress", onKeypress)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
        process.stdin.pause()
      }),
  )
  return queue
})

const make = Terminal.make({
  // @types/node types columns/rows as non-nullable, but they're undefined on non-TTY stdout.
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  columns: Effect.sync(() => process.stdout.columns ?? 80),
  rows: Effect.sync(() => process.stdout.rows ?? 24),
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  display: (text) =>
    Effect.try({
      try: () => {
        process.stdout.write(text)
      },
      catch: (cause) =>
        PlatformError.badArgument({
          module: "Terminal",
          method: "display",
          description: cause instanceof Error ? cause.message : String(cause),
        }),
    }),
  readLine: Effect.tryPromise({
    try: async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      try {
        return await rl.question("")
      } finally {
        rl.close()
      }
    },
    catch: () => new Terminal.QuitError({}),
  }),
  readInput,
})

export const TerminalLive: Layer.Layer<Terminal.Terminal> = Layer.succeed(Terminal.Terminal, make)
