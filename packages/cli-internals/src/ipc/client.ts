import { Effect, Layer, Match } from "effect"
import { BlueprintFileSystem } from "@projitect/core"
import type { BlueprintFileSystemShape } from "@projitect/core"
import { decodeResponse, encodeRequest } from "./protocol.js"
import type { FsError, Request, Response } from "./protocol.js"
import type { Transport } from "./transport.js"

type Pending = (response: Response) => void

/**
 * Child side: a `BlueprintFileSystemShape` that forwards each call to the parent-side server over
 * `transport` and decodes the reply, re-raising failures as the original typed error.
 */
export const makeClient = (transport: Transport): BlueprintFileSystemShape => {
  const pending = new Map<number, Pending>()
  let nextId = 0

  transport.onMessage((frame) => {
    Effect.runFork(
      decodeResponse(frame).pipe(
        Effect.tap((response) =>
          Effect.sync(() => {
            pending.get(response.id)?.(response)
            pending.delete(response.id)
          }),
        ),
        Effect.ignore,
      ),
    )
  })

  const call = (
    build: (id: number) => Request,
  ): Effect.Effect<Exclude<Response, { readonly _tag: "Failure" }>, FsError> =>
    Effect.gen(function* () {
      const id = nextId++
      const encoded = yield* Effect.orDie(encodeRequest(build(id)))
      const response = yield* Effect.callback<Response>((resume) => {
        pending.set(id, (reply) => {
          resume(Effect.succeed(reply))
        })
        transport.send(encoded)
        return Effect.sync(() => pending.delete(id))
      })
      return yield* Match.value(response).pipe(
        Match.tag("Failure", ({ error }) => Effect.fail(error)),
        Match.orElse((ok) => Effect.succeed(ok)),
      )
    })

  // The server only emits a method's own failure tags; the other tag is unreachable by protocol.
  const noRead = <A>(effect: Effect.Effect<A, FsError>) =>
    Effect.catch(effect, (error) =>
      Match.value(error).pipe(
        Match.tag("FsReadFailed", (unreachable) => Effect.die(unreachable)),
        Match.orElse((rest) => Effect.fail(rest)),
      ),
    )
  const noWrite = <A>(effect: Effect.Effect<A, FsError>) =>
    Effect.catch(effect, (error) =>
      Match.value(error).pipe(
        Match.tag("FsWriteFailed", (unreachable) => Effect.die(unreachable)),
        Match.orElse((rest) => Effect.fail(rest)),
      ),
    )
  const onlyDenied = <A>(effect: Effect.Effect<A, FsError>) =>
    Effect.catch(effect, (error) =>
      Match.value(error).pipe(
        Match.tag("FsReadFailed", "FsWriteFailed", (unreachable) => Effect.die(unreachable)),
        Match.orElse((rest) => Effect.fail(rest)),
      ),
    )

  return {
    readFile: (path) =>
      call((id) => ({ _tag: "ReadFile", id, path })).pipe(
        Effect.flatMap((r) =>
          r._tag === "ReadFileOk" ? Effect.succeed(r.value) : Effect.die(unexpected(r)),
        ),
        noWrite,
      ),
    writeFile: (path, content) =>
      call((id) => ({ _tag: "WriteFile", id, path, content })).pipe(Effect.asVoid, noRead),
    exists: (path) =>
      call((id) => ({ _tag: "Exists", id, path })).pipe(
        Effect.flatMap((r) =>
          r._tag === "ExistsOk" ? Effect.succeed(r.value) : Effect.die(unexpected(r)),
        ),
        onlyDenied,
      ),
    remove: (path) => call((id) => ({ _tag: "Remove", id, path })).pipe(Effect.asVoid, noRead),
    removeEmptyDir: (path) =>
      call((id) => ({ _tag: "RemoveEmptyDir", id, path })).pipe(Effect.asVoid, noRead),
    mkdir: (path) => call((id) => ({ _tag: "Mkdir", id, path })).pipe(Effect.asVoid, noRead),
    listDir: (path) =>
      call((id) => ({ _tag: "ListDir", id, path })).pipe(
        Effect.flatMap((r) =>
          r._tag === "ListDirOk" ? Effect.succeed(r.value) : Effect.die(unexpected(r)),
        ),
        noWrite,
      ),
  }
}

const unexpected = (response: Response): string => `Unexpected IPC response: ${response._tag}`

export const makeClientLayer = (transport: Transport): Layer.Layer<BlueprintFileSystem> =>
  Layer.succeed(BlueprintFileSystem, makeClient(transport))
