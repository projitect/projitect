/**
 * A minimal message channel between the parent-side server and the child-side client. Frames are
 * JSON-compatible values, so any process IPC channel can implement it; `makeInProcessPair` backs
 * the tests.
 */
export interface Transport {
  readonly send: (frame: unknown) => void
  readonly onMessage: (handler: (frame: unknown) => void) => void
}

/** Two connected transports: whatever one end sends, the other end's handler receives. */
export const makeInProcessPair = (): readonly [Transport, Transport] => {
  const handlers: [((frame: unknown) => void)[], ((frame: unknown) => void)[]] = [[], []]
  const endpoint = (self: 0 | 1): Transport => ({
    send: (frame) => {
      const peer = self === 0 ? 1 : 0
      queueMicrotask(() => {
        for (const handler of handlers[peer]) {
          handler(frame)
        }
      })
    },
    onMessage: (handler) => {
      handlers[self].push(handler)
    },
  })
  return [endpoint(0), endpoint(1)]
}
