/**
 * @projitect/blueprint-skills
 *
 * Installs agent skills — a `SKILL.md` plus any referenced scripts and assets — into a repo-local
 * skills directory. Each file is written in owned mode, so projitect rewrites it on `remodel`,
 * flags edits as drift in `inspect`, and removes files a newer package version stops shipping.
 *
 * Layout: `<target>/<skill-name>/<relative path>`, with `target` defaulting to `.claude/skills`.
 * Writes are permission-scoped to `<target>/**`; sibling skills and user files are never touched.
 * Removing a skill prunes only that skill's own directory tree, never `<target>` or its ancestors.
 */

import { Array, Effect, Predicate, String } from "effect"
import { ownFile } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"
import { ChangeSet as CS, Errors } from "@projitect/core"

const DEFAULT_TARGET = ".claude/skills"
const SKILL_FILE = "SKILL.md"

/** One skill: a single-segment `name` and its files, keyed by `/`-separated relative path. */
export interface Skill {
  readonly name: string
  /** Must contain `SKILL.md`. Other keys may be nested, e.g. `scripts/run.sh`. */
  readonly files: Readonly<Record<string, string>>
}

export interface SkillsOptions {
  readonly skills: readonly Skill[]
  /** Skills root, relative to the project. Defaults to `".claude/skills"`. */
  readonly target?: string
  /** Stable, namespaced owner id such as `"acme:skills"`. Every skill package needs its own. */
  readonly id: string
  /** The skill package's own version; recorded in the lockfile so upgrades are tracked. */
  readonly version: string
}

/** Why a single path segment is unusable, or `undefined` when it is fine. */
const segmentProblem = (segment: string): string | undefined => {
  if (!String.isNonEmpty(segment)) {
    return "must not be empty"
  }
  if (segment === "." || segment === "..") {
    return "must not be a `.` or `..` segment"
  }
  if (segment.includes("\\")) {
    return "must not contain a backslash"
  }
  if (segment.includes("\0")) {
    return "must not contain a NUL character"
  }
  if (/^[A-Za-z]:/u.test(segment)) {
    return "must not start with a drive letter"
  }
  return undefined
}

/** A skill name is exactly one segment, so it additionally must not contain a separator. */
const nameProblem = (name: string): string | undefined =>
  name.includes("/") ? "must not contain a path separator" : segmentProblem(name)

const GLOB_METACHARACTERS = /[*?[\]{}()!]/u

/** A target is a path whose segments are literal: glob metacharacters would widen `<target>/**`. */
const targetProblem = (target: string): string | undefined =>
  GLOB_METACHARACTERS.test(target)
    ? "must not contain glob metacharacters (* ? [ ] { } ( ) !)"
    : pathProblem(target)

/** First problem across the `/`-separated segments of a relative path, or `undefined`. */
const pathProblem = (value: string): string | undefined =>
  Array.findFirst(String.split(value, "/"), (segment) =>
    Predicate.isNotUndefined(segmentProblem(segment)),
  ).pipe((found) => (found._tag === "Some" ? segmentProblem(found.value) : undefined))

const invalid = (
  field: "target" | "name" | "path" | "skill" | "id" | "version",
  value: string,
  problem: string,
) =>
  new Errors.SkillInvalid({
    id: "pjt.skills.invalid-path",
    field,
    value,
    message: `Invalid skill ${field} ${JSON.stringify(value)}: ${problem}.`,
  })

const validate = (options: SkillsOptions, target: string) => {
  const names = Array.map(options.skills, (skill) => skill.name)
  const failures = [
    // `id` and `version` are required by the type, but JavaScript and config callers can omit them.
    ...(Predicate.isString(options.id) &&
    options.id.includes(":") &&
    String.isNonEmpty(options.id.replaceAll(":", ""))
      ? []
      : [
          invalid(
            "id",
            globalThis.String(options.id),
            "pick your own stable namespaced id such as `acme:skills`",
          ),
        ]),
    ...(Predicate.isString(options.version) && String.isNonEmpty(options.version.trim())
      ? []
      : [
          invalid(
            "version",
            globalThis.String(options.version),
            "pick your own non-empty version for this skill package",
          ),
        ]),
    ...Array.fromNullishOr(targetProblem(target)).map((p) => invalid("target", target, p)),
    ...Array.flatMap(options.skills, (skill) => [
      ...Array.fromNullishOr(nameProblem(skill.name)).map((p) => invalid("name", skill.name, p)),
      ...(Object.hasOwn(skill.files, SKILL_FILE)
        ? []
        : [invalid("skill", skill.name, `must include a ${SKILL_FILE} file`)]),
      ...Array.flatMap(Object.keys(skill.files), (path) =>
        Array.fromNullishOr(pathProblem(path)).map((p) => invalid("path", path, p)),
      ),
    ]),
    ...Array.flatMap(Array.dedupe(names), (name) =>
      Array.filter(names, (n) => n === name).length > 1
        ? [invalid("skill", name, "is declared more than once in this package")]
        : [],
    ),
  ]
  return Array.head(failures)
}

/**
 * Build the skills blueprint. Emits one owned-file operation per skill file, all attributed to
 * the blueprint `id`.
 */
export const skills = (options: SkillsOptions): Blueprint.Blueprint => {
  const { id, version } = options
  const target = options.target ?? DEFAULT_TARGET

  return {
    id,
    version,
    description: `agent skills in ${target}`,
    permissions: [{ kind: "write", glob: `${target}/**` }],
    plan: Effect.gen(function* () {
      const failure = validate(options, target)
      if (failure._tag === "Some") {
        return yield* failure.value
      }
      const files = Array.flatMap(options.skills, (skill) =>
        Array.map(Object.entries(skill.files), ([path, content]) =>
          ownFile({
            id,
            version,
            path: `${target}/${skill.name}/${path}`,
            content,
            ownedDir: `${target}/${skill.name}`,
          }),
        ),
      )
      const changeSets = yield* Effect.forEach(files, (b) => b.plan)
      return CS.Reducer.combineAll(changeSets)
    }),
  }
}
