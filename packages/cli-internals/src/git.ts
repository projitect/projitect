import { promises as fs } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { Effect } from "effect"
import { Errors } from "@projitect/core"

/**
 * Returns true if `<projectRoot>/.git` exists (file or directory). Used by `pjt init` and
 * `pjt build --force` as a hard prerequisite.
 */
export const isGitRepo = (projectRoot: string): Effect.Effect<boolean> =>
  Effect.promise(() =>
    fs.access(path.join(projectRoot, ".git")).then(
      () => true,
      () => false,
    ),
  )

/**
 * Result of `git status --porcelain`. `clean === true` means there are no uncommitted changes
 * (including untracked files); `lines` is the parsed porcelain output for diagnostics.
 */
export interface GitStatus {
  readonly clean: boolean
  readonly lines: readonly string[]
}

/**
 * Shell out to `git status --porcelain` and parse. Wraps process spawn failures (non-zero exit,
 * git not installed) as `pjt.git.command-failed`. Callers ensure `.git/` exists first.
 */
export const gitStatus = (params: {
  readonly projectRoot: string
}): Effect.Effect<GitStatus, Errors.GitCommandFailed> => {
  const { projectRoot } = params
  return Effect.tryPromise({
    try: () =>
      new Promise<GitStatus>((resolve, reject) => {
        const child = spawn("git", ["status", "--porcelain"], { cwd: projectRoot })
        let stdout = ""
        let stderr = ""
        child.stdout.on("data", (chunk: Buffer) => {
          stdout = stdout + chunk.toString("utf8")
        })
        child.stderr.on("data", (chunk: Buffer) => {
          stderr = stderr + chunk.toString("utf8")
        })
        child.on("error", reject)
        child.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`git status exited with ${String(code)}: ${stderr.trim()}`))
            return
          }
          const lines = stdout
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
          resolve({ clean: lines.length === 0, lines })
        })
      }),
    catch: (e) =>
      new Errors.GitCommandFailed({
        id: "pjt.git.command-failed",
        command: "git status --porcelain",
        cause: e instanceof Error ? e.message : String(e),
        message: `Failed to run \`git status --porcelain\` in ${projectRoot}`,
      }),
  })
}

/**
 * Raise `pjt.git.not-a-repo` if `<projectRoot>/.git` is missing.
 */
export const ensureGitRepo = (params: {
  readonly projectRoot: string
}): Effect.Effect<void, Errors.GitNotARepo> =>
  Effect.gen(function* () {
    const ok = yield* isGitRepo(params.projectRoot)
    if (ok) {
      return
    }
    return yield* new Errors.GitNotARepo({
      id: "pjt.git.not-a-repo",
      projectRoot: params.projectRoot,
      message: `No \`.git\` directory at ${params.projectRoot}. \`pjt build --force\` requires a git repository so destructive operations are recoverable. Run \`git init\` (or \`pjt init --yes\`), commit, then re-run.`,
    })
  })
