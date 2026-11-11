/**
 * The pipeline behind the in-browser demo: evaluate the editor text, plan it against an in-memory
 * project, then diff the plan against that project. Everything runs in the visitor's tab; there is
 * no server and no Node. The text runs as JavaScript in this page's realm (see the Browser demo
 * boundary in docs/architecture.md), so only text the visitor typed reaches it.
 */
import { Effect, Result } from "effect"
import {
  blueprintTree,
  buildPlan,
  diffLockfile,
  diffPlan,
  evaluatePjt,
  makeGatedLayer,
  renderInspectReport,
} from "@projitect/cli-internals/browser"
import type { FilePlan } from "@projitect/cli-internals/browser"
import { firstPartyRegistry } from "@projitect/cli-internals/browser-blueprints"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { seedFiles } from "./seed"

/** One file the plan writes, with the blueprints that contribute to it. */
interface PlanEntry {
  readonly path: string
  readonly mode: FilePlan["_tag"]
  readonly owners: readonly string[]
}

export type DemoResult =
  | {
      readonly ok: true
      readonly plan: readonly PlanEntry[]
      readonly commands: readonly string[]
      readonly drift: string
      readonly hasDrift: boolean
    }
  | { readonly ok: false; readonly message: string }

const unique = (values: Iterable<string>): readonly string[] => [...new Set(values)]

const entryOf = (file: FilePlan): PlanEntry => {
  switch (file._tag) {
    case "Region": {
      return {
        path: file.path,
        mode: file._tag,
        owners: unique(file.regions.map((r) => r.ownerId)),
      }
    }
    case "Merge": {
      return { path: file.path, mode: file._tag, owners: unique(file.ownership.values()) }
    }
    case "Owned":
    case "Seed": {
      return { path: file.path, mode: file._tag, owners: [file.ownerId] }
    }
  }
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "The demo could not run this file."

/** Plan and diff an already-evaluated file against the seeded project. */
const planAndDiff = (source: string): Effect.Effect<DemoResult, unknown> => {
  const evaluated = evaluatePjt(source, firstPartyRegistry)
  if (Result.isFailure(evaluated)) {
    return Effect.succeed({ ok: false, message: evaluated.failure.message })
  }
  const base = makeInMemoryLayer(seedFiles)
  return Effect.gen(function* () {
    const tree = yield* blueprintTree(evaluated.success)
    const { plan, byBlueprint } = yield* buildPlan({
      tree,
      projectRoot: "/",
      layerFor: (config) => makeGatedLayer(base, config),
    })
    const diff = yield* diffPlan({ plan })
    const { removals, upgrades } = diffLockfile({ previous: null, current: byBlueprint })
    return {
      ok: true as const,
      plan: plan.files.map(entryOf),
      commands: plan.commands.map((c) => c.command),
      drift: renderInspectReport({ diff, removals, upgrades }),
      hasDrift: diff.hasDrift,
    }
  }).pipe(Effect.provide(base))
}

/**
 * Run the demo for one editor text. Never throws or rejects: a syntax error, an unknown import, a
 * plan conflict or any other failure comes back as `{ ok: false, message }`.
 */
export const runDemo = async (source: string): Promise<DemoResult> => {
  try {
    const outcome = await Effect.runPromise(Effect.result(planAndDiff(source)))
    return Result.isSuccess(outcome)
      ? outcome.success
      : { ok: false, message: messageOf(outcome.failure) }
  } catch (cause) {
    return { ok: false, message: messageOf(cause) }
  }
}
