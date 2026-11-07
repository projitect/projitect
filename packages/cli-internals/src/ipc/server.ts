import { Effect, Match, pipe } from "effect"
import type { BlueprintFileSystemShape } from "@projitect/core"
import { decodeRequest, encodeResponse } from "./protocol.js"
import type { Request, Response } from "./protocol.js"
import type { Transport } from "./transport.js"

const respond = (shape: BlueprintFileSystemShape, request: Request): Effect.Effect<Response> => {
  const failure = (error: Extract<Response, { readonly _tag: "Failure" }>["error"]): Response => ({
    _tag: "Failure",
    id: request.id,
    error,
  })
  return pipe(
    request,
    Match.value,
    Match.tag("ReadFile", ({ id, path }) =>
      Effect.map(shape.readFile(path), (value): Response => ({ _tag: "ReadFileOk", id, value })),
    ),
    Match.tag("WriteFile", ({ id, path, content }) =>
      Effect.map(shape.writeFile(path, content), (): Response => ({ _tag: "WriteFileOk", id })),
    ),
    Match.tag("Exists", ({ id, path }) =>
      Effect.map(shape.exists(path), (value): Response => ({ _tag: "ExistsOk", id, value })),
    ),
    Match.tag("Remove", ({ id, path }) =>
      Effect.map(shape.remove(path), (): Response => ({ _tag: "RemoveOk", id })),
    ),
    Match.tag("RemoveEmptyDir", ({ id, path }) =>
      Effect.map(shape.removeEmptyDir(path), (): Response => ({ _tag: "RemoveEmptyDirOk", id })),
    ),
    Match.tag("Mkdir", ({ id, path }) =>
      Effect.map(shape.mkdir(path), (): Response => ({ _tag: "MkdirOk", id })),
    ),
    Match.tag("ListDir", ({ id, path }) =>
      Effect.map(shape.listDir(path), (value): Response => ({ _tag: "ListDirOk", id, value })),
    ),
    Match.exhaustive,
    Effect.catch((error) => Effect.succeed(failure(error))),
  )
}

/**
 * Parent side: decode each request frame, run it against the (permission-gated) `shape` and send
 * the encoded response back. Frames that fail to decode are dropped — the client only ever sends
 * well-formed frames, and a correlation id cannot be recovered from a malformed one.
 */
export const serve = (transport: Transport, shape: BlueprintFileSystemShape): void => {
  transport.onMessage((frame) => {
    Effect.runFork(
      decodeRequest(frame).pipe(
        Effect.flatMap((request) => respond(shape, request)),
        Effect.flatMap(encodeResponse),
        Effect.tap((encoded) =>
          Effect.sync(() => {
            transport.send(encoded)
          }),
        ),
        Effect.ignore,
      ),
    )
  })
}
