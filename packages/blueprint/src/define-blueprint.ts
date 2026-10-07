import type { Schema } from "effect"
import type { Blueprint } from "@projitect/core"

/**
 * `NonNullable<unknown>` is TypeScript's normalized form of the empty-object type. Using it
 * (rather than a bare `{}` literal, which `@typescript-eslint/no-empty-object-type` flags) drives
 * the conditional below: when every field of `A` is optional, the empty object is itself a valid
 * `A`, so the call becomes zero-arg; otherwise the argument stays required.
 */
type OptionalIfAllFieldsOptional<A> = NonNullable<unknown> extends A ? [args?: A] : [args: A]

/**
 * The spec an author passes to {@link defineBlueprint}. `A` is inferred from `args`'s decoded
 * type — authors never write it by hand, and `build`'s parameter needs no annotation.
 */
export interface BlueprintDefinitionSpec<A, S extends Schema.Schema<unknown> = Schema.Schema<A>> {
  readonly id: string
  readonly args: S
  readonly build: (args: A) => Blueprint.Blueprint
}

/**
 * A declared blueprint: callable with its arguments to produce the `Blueprint`, and readable
 * (`id` / `args`) without calling it so tooling can introspect the argument Schema.
 */
export interface BlueprintDefinition<A, S extends Schema.Schema<unknown> = Schema.Schema<A>> {
  (...args: OptionalIfAllFieldsOptional<A>): Blueprint.Blueprint
  readonly id: string
  readonly args: S
}

/**
 * Declare a blueprint's typed arguments. `defineBlueprint({ id, args, build })` returns a
 * definition that is itself callable with those arguments — `definition(args)` runs `build` and
 * returns its `Blueprint` — so a `.pjt.ts` file keeps writing the same call shape
 * (`vitest({ coverage: null })`) whether the blueprint was authored this way or as a bare factory
 * function. `id` and `args` are also readable as plain properties, exposing the Schema instance
 * the author passed in (by reference) without invoking `build`.
 *
 * This does not decode `args` against the Schema — arguments reach `build` unchanged. Runtime
 * validation against the Schema is a separate concern (see `pjt.blueprint.invalid-args`).
 */
export const defineBlueprint = <S extends Schema.Schema<unknown>>(
  def: BlueprintDefinitionSpec<Schema.Schema.Type<S>, S>,
): BlueprintDefinition<Schema.Schema.Type<S>, S> => {
  type Args = Schema.Schema.Type<S>
  const call = (arg?: Args): Blueprint.Blueprint => def.build(arg ?? ({} as Args))
  return Object.assign(call, { id: def.id, args: def.args })
}
