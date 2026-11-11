/**
 * Browser-safe engine entry — `@projitect/cli-internals/browser`. Plan, diff, apply and lockfile
 * logic plus the `.pjt.ts` evaluator, with no `node:*` anywhere in its module graph (ESLint and the
 * `browser-bundle` test both enforce that). Pair it with an in-memory `BlueprintFileSystem` such as
 * `@projitect/test-kit`'s. The CLI commands, git, package-manager and Node platform layers are
 * deliberately not re-exported.
 */
export { pjt, isEffectTree, type ProjitectFile, type BlueprintTree } from "./config-file.js"
export { evaluatePjt, blueprintTree, PjtEvalFailure, type ModuleRegistry } from "./evaluate-pjt.js"
export { makeGatedLayer } from "./gated-layer.js"
export {
  buildPlan,
  diffLockfile,
  type LayerFor,
  type ProjectPlan,
  type FilePlan,
  type ByBlueprint,
  type UpgradeRecord,
} from "./plan.js"
export {
  diffPlan,
  renderPlanDiff,
  renderInspectReport,
  type PlanDiff,
  type FileDiff,
} from "./differ.js"
export { applyPlan } from "./applier.js"
export { applyRemovals } from "./remover.js"
export { readLockfile, writeLockfile, blueprintIds } from "./lockfile.js"
