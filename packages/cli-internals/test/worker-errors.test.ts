import { Schema } from "effect"
import { Errors } from "@projitect/core"
import { describe, expect, it } from "vitest"

describe("worker errors", () => {
  it("WorkerCrashed round-trips through Schema", () => {
    const error = new Errors.WorkerCrashed({
      id: "pjt.worker.crashed",
      exitCode: 1,
      message: "boom",
    })
    const decoded = Schema.decodeUnknownSync(Errors.WorkerCrashed)(
      Schema.encodeUnknownSync(Errors.WorkerCrashed)(error),
    )
    expect(decoded).toBeInstanceOf(Errors.WorkerCrashed)
    expect(decoded).toEqual(error)
  })

  it("WorkerTimedOut round-trips through Schema", () => {
    const error = new Errors.WorkerTimedOut({
      id: "pjt.worker.timed-out",
      timeoutMs: 5000,
      message: "slow",
    })
    const decoded = Schema.decodeUnknownSync(Errors.WorkerTimedOut)(
      Schema.encodeUnknownSync(Errors.WorkerTimedOut)(error),
    )
    expect(decoded).toBeInstanceOf(Errors.WorkerTimedOut)
    expect(decoded).toEqual(error)
  })

  it("WorkerExitedEarly round-trips through Schema", () => {
    const error = new Errors.WorkerExitedEarly({
      id: "pjt.worker.exited-early",
      signal: "SIGKILL",
      message: "gone",
    })
    const decoded = Schema.decodeUnknownSync(Errors.WorkerExitedEarly)(
      Schema.encodeUnknownSync(Errors.WorkerExitedEarly)(error),
    )
    expect(decoded).toBeInstanceOf(Errors.WorkerExitedEarly)
    expect(decoded).toEqual(error)
  })

  it("registers every worker id", () => {
    expect(Errors.ERROR_IDS).toEqual(
      expect.arrayContaining([
        "pjt.worker.crashed",
        "pjt.worker.timed-out",
        "pjt.worker.exited-early",
      ]),
    )
  })
})
