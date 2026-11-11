import { Array, Effect, Option, Order, Record, pipe } from "effect"
import { PredicateX } from "@nunofyobiz/effect-extras"
import { Errors } from "@projitect/core"
import type { ChangeSet } from "@projitect/core"

/**
 * Merge-mode ownership rules, judged on dotted-path segment boundaries. Pure: planning calls these
 * before anything is written, and the differ reuses them to keep removals off live keys.
 */

/** A dotted key's path segments — the one convention planning and removal share. */
export const keySegments = (key: string): readonly string[] => key.split(".")

/** `ancestor` equals `key` or is a proper ancestor of it: `scripts` covers `scripts.test`, not `scripts.testing`. */
export const covers = (ancestor: string, key: string): boolean => {
  const prefix = keySegments(ancestor)
  const segments = keySegments(key)
  return (
    prefix.length <= segments.length &&
    Array.every(prefix, (segment, index) => segment === segments[index])
  )
}

/** One of the keys covers the other (or they are equal). */
export const overlaps = (a: string, b: string): boolean => covers(a, b) || covers(b, a)

/**
 * Sorted, duplicate-free keys with every key already covered by another key dropped. The same
 * owner declaring `scripts` and `scripts.test` therefore owns `scripts`, in either order.
 */
export const minimalKeys = (keys: readonly string[]): readonly string[] => {
  const sorted = pipe(Array.dedupe(keys), Array.sort(Order.String))
  return Array.filter(
    sorted,
    (key) => !Array.some(sorted, (other) => other !== key && covers(other, key)),
  )
}

interface Claim {
  readonly ownerId: string
  readonly key: string
}

const claimOrder: Order.Order<Claim> = Order.combine(
  Order.mapInput(Order.String, (claim: Claim) => claim.ownerId),
  Order.mapInput(Order.String, (claim: Claim) => claim.key),
)

/**
 * Fold the merge ops' `ownedKeys` into a `key → ownerId` map of minimal keys, failing when two
 * distinct owners claim overlapping keys. The conflict names the owners in `ownerId` order so
 * the outcome does not depend on declaration order, and `key` is the covering (shorter) key.
 */
export const reconcileOwnership = (
  path: string,
  ops: readonly ChangeSet.MergeOp[],
  conflictNextStep: string,
): Effect.Effect<ReadonlyMap<string, string>, Errors.PlanConflictMerge> => {
  const claims = pipe(
    Array.groupBy(ops, (op) => op.ownerId),
    Record.toEntries,
    Array.flatMap(([ownerId, owned]) =>
      Array.map(
        minimalKeys(Array.flatMap(owned, (op) => op.ownedKeys)),
        (key): Claim => ({ ownerId, key }),
      ),
    ),
    Array.sort(claimOrder),
  )
  const conflict = Array.findFirst(
    Array.flatMap(claims, (a) => Array.map(claims, (b) => [a, b] as const)),
    ([a, b]) => a.ownerId < b.ownerId && overlaps(a.key, b.key),
  )
  return Option.match(conflict, {
    onNone: () => Effect.succeed(new Map(Array.map(claims, (c) => [c.key, c.ownerId] as const))),
    onSome: ([a, b]) => {
      const [ancestor, descendant] = covers(a.key, b.key) ? [a, b] : [b, a]
      return Effect.fail(
        new Errors.PlanConflictMerge({
          id: "pjt.plan.conflict-merge",
          path,
          key: ancestor.key,
          ownerA: a.ownerId,
          ownerB: b.ownerId,
          message:
            ancestor.key === descendant.key
              ? `Blueprints ${a.ownerId} and ${b.ownerId} both claim key "${ancestor.key}" in ${path}. ${conflictNextStep}`
              : `Blueprint ${ancestor.ownerId} claims key "${ancestor.key}" in ${path}, which contains "${descendant.key}" claimed by ${descendant.ownerId}. ${conflictNextStep}`,
        }),
      )
    },
  })
}

/**
 * The dotted fields a merge `value` writes, as the deep merge would write them: plain objects
 * recurse, while arrays, primitives, `null` and an empty nested `{}` replace what is there, so
 * each is one field. An empty root `{}` merges as a no-op and writes nothing.
 */
export const writtenFields = (value: unknown): readonly string[] => {
  const leaves = (node: unknown, prefix: readonly string[]): readonly string[] =>
    PredicateX.unsafeIsRecord(node) && !Record.isEmptyRecord(node)
      ? Array.flatMap(Record.toEntries(node), ([key, child]) => leaves(child, [...prefix, key]))
      : [prefix.join(".")]
  return PredicateX.unsafeIsRecord(value) && Record.isEmptyRecord(value)
    ? []
    : pipe(leaves(value, []), Array.sort(Order.String))
}

/** Every field the op's value writes must sit at or under one of the op's own `ownedKeys`. */
export const checkWriteCoverage = (
  path: string,
  op: ChangeSet.MergeOp,
): Effect.Effect<void, Errors.PlanUnownedMergeWrite> =>
  Array.findFirst(
    writtenFields(op.value),
    (field) => !Array.some(op.ownedKeys, (key) => covers(key, field)),
  ).pipe(
    Option.match({
      onNone: () => Effect.void,
      onSome: (field) =>
        Effect.fail(
          new Errors.PlanUnownedMergeWrite({
            id: "pjt.plan.unowned-merge-write",
            path,
            field,
            ownerId: op.ownerId,
            message: `Blueprint ${op.ownerId} writes ${field === "" ? "a non-object value over the whole file" : `field "${field}"`} in ${path} without owning it; add the field, or an ancestor key, to that blueprint's ownedKeys.`,
          }),
        ),
    }),
  )
