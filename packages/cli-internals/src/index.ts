export { rootCommand, type RootCommand } from "./commands/dispatch.js"
export { inspect, type InspectResult } from "./commands/inspect.js"
export { remodel, type RemodelResult } from "./commands/remodel.js"
export { init, type InitResult } from "./commands/init.js"
export { explain } from "./commands/explain.js"
export { build } from "./commands/build.js"
export { add } from "./commands/add.js"
export { resolveConfig, parseEnv } from "./config-cascade.js"
export {
  loadBlueprintFile,
  pjt,
  isEffectTree,
  type ProjitectFile,
  type BlueprintTree,
} from "./loader.js"
export {
  buildPlan,
  diffLockfile,
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
export { makeRealLayer, makeProjectRootLayer } from "./filesystem-impl.js"
export {
  NodePlatformLive,
  FileSystemLive,
  StdioLive,
  TerminalLive,
  runCommand,
  nodeSpawner,
  type ProcessSpawner,
  type CommandOutput,
} from "./platform/index.js"
export { splice } from "./edit-pjt.js"
export {
  detect as detectPackageManager,
  installDev,
  readProjitectMetadata,
  type PackageManager,
} from "./pm.js"
export type { ProjitectPackageMetadata } from "@projitect/blueprint"
export { isGitRepo, gitStatus, ensureGitRepo } from "./git.js"
export * as Ipc from "./ipc/index.js"
