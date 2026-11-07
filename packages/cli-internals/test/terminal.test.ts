import process from "node:process"
import { Effect, Exit, Option, Queue, Terminal } from "effect"
import { describe, expect, it } from "vitest"
import { TerminalLive } from "../src/platform/terminal.js"

/**
 * The Node `Terminal` layer's `readInput`: keypress events on stdin become queued `UserInput`s,
 * Ctrl-C ends the queue (so a prompt fails with `QuitError`), and leaving the scope detaches the
 * listener. Tests emit `keypress` events directly; stdin is not a TTY under Vitest, so raw mode is
 * never touched.
 */
const withInput = <A, E>(
  body: (input: Queue.Dequeue<Terminal.UserInput, Queue.Done>) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      return yield* Effect.scoped(Effect.flatMap(terminal.readInput, body))
    }).pipe(Effect.provide(TerminalLive)),
  )

describe("TerminalLive.readInput", () => {
  it("queues a UserInput for each keypress", async () => {
    const inputs = await withInput((queue) =>
      Effect.gen(function* () {
        process.stdin.emit("keypress", "a", { name: "a", ctrl: false, meta: false, shift: false })
        process.stdin.emit("keypress", undefined, { name: "down", shift: true })
        return [yield* Queue.take(queue), yield* Queue.take(queue)]
      }),
    )
    expect(inputs).toEqual([
      { input: Option.some("a"), key: { name: "a", ctrl: false, meta: false, shift: false } },
      { input: Option.none(), key: { name: "down", ctrl: false, meta: false, shift: true } },
    ])
  })

  it("ends the queue on Ctrl-C after delivering the keypress", async () => {
    const exit = await withInput((queue) =>
      Effect.gen(function* () {
        process.stdin.emit("keypress", "\u0003", { name: "c", ctrl: true })
        yield* Queue.take(queue)
        return yield* Effect.exit(Queue.take(queue))
      }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("detaches its keypress listener when the scope closes", async () => {
    const before = process.stdin.listenerCount("keypress")
    await withInput(() => Effect.void)
    expect(process.stdin.listenerCount("keypress")).toBe(before)
  })
})
