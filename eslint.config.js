import js from "@eslint/js"
import tseslint from "typescript-eslint"
import unicorn from "eslint-plugin-unicorn"
import packageJson from "eslint-plugin-package-json"
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs"
import vitestPlugin from "@vitest/eslint-plugin"
import importPlugin from "eslint-plugin-import"
import prettierRecommended from "eslint-plugin-prettier/recommended"

/**
 * Flat ESLint config. Two notable structural choices, adapted from StoryCut and effect-clue:
 *
 *  1. **ESLint absorbs Prettier.** `eslint-plugin-prettier/recommended` runs Prettier
 *     as a lint rule, surfacing formatting drift as ESLint errors. One command (`pnpm lint`)
 *     covers everything for JS/TS/JSON files; one CI job. Prettier handles MDX/YAML/JSON5
 *     out-of-band via lint-staged for files ESLint doesn't parse.
 *
 *  2. **Unicorn `recommended` only, not `all`.** The `all` preset is heavily opinionated
 *     and conflicts with Effect-heavy code (custom errors, reduce chains, etc.). We pick
 *     `recommended` and disable the few rules that don't fit.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/coverage/**",
      "**/bin/**",
      "**/.husky/**",
      "**/.changeset/*.md",
      // Contributor tooling (kanban skill scripts), not published library source — see the
      // "Scope: contributor tooling" note in AGENTS.md. Not held to the library's strict rules.
      ".claude/**",
      "prettier.config.js",
      "vitest.config.ts",
      "eslint.config.js",
      "apps/website/**",
    ],
  },

  // ===== Base presets (JS-wide; type-checked rules scoped to TS below) =====
  js.configs.recommended,
  unicorn.configs["flat/all"],
  eslintComments.recommended,

  // ===== Type-checked TS rules — scoped to TS files only so they don't trip on JSON =====
  // Adapted from StoryCut: strict + stylistic type-checked presets (not just recommended).
  ...[...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map(
    (cfg) => ({
      ...cfg,
      files: ["**/*.{ts,tsx,mts,cts}"],
    }),
  ),

  // Prettier integration. Last so it disables conflicting style rules from earlier presets.
  prettierRecommended,

  // ===== Workspace-wide rules (scoped to JS/TS — package.json is handled by its own
  // parser via eslint-plugin-package-json below) =====
  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}"],
    plugins: { import: importPlugin },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // Adapted from StoryCut: stronger boolean / template-literal discipline.
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: true,
          allowNever: false,
          allowNullish: false,
          allowRegExp: false,
        },
      ],

      // ===== Core quality rules (adapted from StoryCut; React-specific rules omitted) =====
      "no-warning-comments": "error",
      "no-console": "error",
      "no-useless-rename": "error",
      yoda: ["error", "never"],
      "require-unicode-regexp": "error",
      radix: ["error", "always"],
      "prefer-template": "error",
      "prefer-spread": "error",
      "prefer-rest-params": "error",
      "prefer-regex-literals": "error",
      "prefer-promise-reject-errors": "error",
      "prefer-object-spread": "error",
      "prefer-object-has-own": "error",
      "prefer-numeric-literals": "error",
      "prefer-named-capture-group": "error",
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
      "prefer-arrow-callback": ["error", { allowNamedFunctions: true }],
      "operator-assignment": ["error", "never"],
      "logical-assignment-operators": ["error", "never"],
      "one-var": ["error", "never"],
      "object-shorthand": ["error", "always"],
      "no-void": "error",
      "no-var": "error",
      "no-useless-return": "error",
      "no-useless-constructor": "error",
      "no-useless-concat": "error",
      "no-useless-computed-key": "error",
      "no-useless-call": "error",
      "no-unused-expressions": "error",
      "no-unneeded-ternary": "error",
      "no-throw-literal": "error",
      "no-sequences": "error",
      "no-script-url": "error",
      "no-return-assign": "error",
      "no-proto": "error",
      "no-object-constructor": "error",
      "no-new-wrappers": "error",
      "no-new-func": "error",
      "no-new": "error",
      "no-negated-condition": "error",
      "no-multi-assign": "error",
      "no-loop-func": "error",
      "no-lonely-if": "error",
      "no-lone-blocks": "error",
      "no-labels": "error",
      "no-iterator": "error",
      "no-invalid-this": "error",
      "no-implied-eval": "error",
      "no-implicit-globals": "error",
      "no-implicit-coercion": "error",
      "no-extra-bind": "error",
      "no-extend-native": "error",
      "no-eval": "error",
      "no-eq-null": "error",
      "no-empty-function": "error",
      "no-else-return": ["error", { allowElseIf: false }],
      "no-bitwise": "error",
      "no-array-constructor": "error",
      "new-cap": ["error", { capIsNew: false }],
      "guard-for-in": "error",
      "func-style": ["error", "declaration", { allowArrowFunctions: true }],
      "func-names": ["error", "always", { generators: "never" }],
      "func-name-matching": "error",
      eqeqeq: ["error", "always"],
      // Type-aware variant: respects `noPropertyAccessFromIndexSignature` (bracket access for
      // index-signature props stays required).
      "dot-notation": "off",
      "@typescript-eslint/dot-notation": ["error", { allowIndexSignaturePropertyAccess: true }],
      "default-case-last": "error",
      "default-case": "error",
      curly: ["error", "all"],
      "consistent-this": ["error", "self"],
      "capitalized-comments": ["error", "always", { ignoreConsecutiveComments: true }],
      camelcase: ["error", { properties: "never" }],
      "arrow-body-style": ["error", "as-needed"],
      "require-atomic-updates": "error",
      "no-unreachable-loop": "error",
      "no-unmodified-loop-condition": "error",
      "no-template-curly-in-string": "error",
      "no-self-compare": "error",
      "no-promise-executor-return": "error",
      "no-constructor-return": "error",
      "no-await-in-loop": "error",
      "array-callback-return": "error",

      // Unicorn overrides — silence rules that don't fit our style (matched to StoryCut's set,
      // now that we run the `flat/all` preset).
      // Effect uses `null` as a meaningful absence (vs `Option.none()`); allowed.
      "unicorn/no-null": "off",
      // `newFoo` / `forFoo` identifiers are common and harmless.
      "unicorn/no-keyword-prefix": "off",
      // Its autofix drops the encoding arg, but TS's `JSON.parse` rejects a Buffer argument.
      "unicorn/prefer-json-parse-buffer": "off",
      "unicorn/consistent-existence-index-check": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/throw-new-error": "off",
      // Some `Effect.gen` returns benefit from `undefined` explicitly.
      "unicorn/no-useless-undefined": [
        "error",
        { checkArguments: false, checkArrowFunctionBody: false },
      ],
      // Schema.TaggedError constructors clash with this rule.
      "unicorn/custom-error-definition": "off",
      // Effect.forEach + array.forEach are idiomatic for side-effecting iterations.
      "unicorn/no-array-for-each": "off",
      // Array.from(iterable, fn) is sometimes clearer than spread.
      "unicorn/prefer-spread": "off",
      // We use reduce idiomatically (especially in config-cascade and JSON deep-merge).
      "unicorn/no-array-reduce": "off",
      // Too noisy in nested handler chains.
      "unicorn/consistent-function-scoping": "off",
      // Type-safe TS makes the extra-args footgun a non-issue; allow short-form callbacks.
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-array-method-this-argument": "off",
      // The allowlist would need extension for every code-review iteration; we trust
      // reviewers to call out genuinely bad names. The rule still catches the egregious
      // cases like single-letter top-level variables via other rules.
      "unicorn/prevent-abbreviations": "off",
      // Filenames: kebab-case for TS source, but allow uppercase markdown.
      "unicorn/filename-case": [
        "error",
        {
          cases: { kebabCase: true },
          ignore: [
            /^[A-Z]+\.md$/, // README.md, AGENTS.md, CLAUDE.md
            /^pjt\./, // pjt.fs.permission-denied.mdx etc.
            /SKILL\.md$/,
          ],
        },
      ],

      // ESLint comments
      "@eslint-community/eslint-comments/no-unused-disable": "error",

      // ===== Import hygiene (adapted from StoryCut) — syntactic rules only; tsc already
      // catches unresolved / missing-dependency imports, so we skip the resolver-backed rules. =====
      "import/first": "error",
      "import/no-duplicates": "error",
      "import/newline-after-import": "error",
      // NOTE: StoryCut also runs `import/no-useless-path-segments`, but it strips the explicit
      // `/index.js` that this repo's NodeNext resolution requires — so it's omitted here.
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import/order": ["error", { "newlines-between": "never" }],
      // Ban `<package>/index` imports (e.g. `effect/index`): they resolve locally because the
      // @effect/language-service patch strips `/index`, but break under an unpatched tsc/bundler.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`^(?!\.).+/index$`,
              message:
                "Import the package root (e.g. `effect`), not its `/index` path — the @effect/language-service patch hides this locally but it breaks elsewhere.",
            },
          ],
        },
      ],
    },
  },

  // ===== Sandbox enforcement: blueprint packages can't reach raw Node APIs =====
  //
  // The blueprint sandbox is "soft" today — enforced at the Effect Layer level by
  // cli-internals' permission gate. This lint rule is the second line of defense: it stops a
  // blueprint package from ever importing `node:fs`, `node:child_process`, etc. directly,
  // which would bypass the sandbox at runtime. A worker-process sandbox (v0.2+) makes this
  // moot; until then, the rule keeps the soft sandbox honest.
  {
    files: ["packages/blueprint/**", "packages/blueprint-*/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@effect/platform",
              importNames: ["FileSystem"],
              message:
                "Blueprints must use `BlueprintFileSystem` from `@projitect/blueprint`, never `@effect/platform`'s `FileSystem` directly. See https://projitect.dev/docs/concepts/sandbox",
            },
          ],
          patterns: [
            {
              regex: "^node:",
              message:
                "Blueprint packages must not import raw Node APIs (node:fs, node:child_process, etc.). Use `BlueprintFileSystem` for filesystem access; shell-out belongs in cli-internals.",
            },
          ],
        },
      ],
    },
  },

  // ===== @projitect/core stays runtime-pure =====
  //
  // Core is types + Schema + error definitions; it must work in any JS runtime. Banning
  // `node:*` imports keeps it portable should we later want to run a blueprint planner in the
  // browser (interactive in-browser demo on the docs site is on the roadmap).
  {
    files: ["packages/core/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^node:",
              message:
                "@projitect/core must stay runtime-pure (no node:* imports). Move runtime-only helpers into @projitect/cli-internals.",
            },
          ],
        },
      ],
    },
  },

  // ===== @projitect/test-kit is an in-memory FS by definition =====
  //
  // If a test-kit consumer needs real disk access in their tests, they should bypass
  // BlueprintFileSystem entirely — but the test-kit itself must never touch the disk.
  {
    files: ["packages/test-kit/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^node:",
              message:
                "@projitect/test-kit must stay in-memory. Don't import node:* — that would defeat the purpose of an in-memory test FS.",
            },
          ],
        },
      ],
    },
  },

  // ===== Vitest plugin =====
  //
  // Scoped to test files only — the plugin's rules don't make sense for non-test code (`no-focused-tests`
  // would never fire elsewhere, etc.). Recommended preset covers the lint rules the team gets the most
  // value from: forbid `.only` / `.skip` slipping into CI, assertion-shape sanity, etc. See the
  // "Reach for ESLint first" reflex in AGENTS.md — adding vitest is exactly the trigger that calls for
  // this plugin.
  {
    files: ["**/test/**/*.{ts,tsx,mts,cts}", "**/*.{test,spec}.{ts,tsx,mts,cts}"],
    plugins: { vitest: vitestPlugin },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
    },
    settings: { vitest: { typecheck: true } },
    languageOptions: {
      globals: { ...vitestPlugin.environments.env.globals },
    },
  },

  // ===== Package.json validation =====
  //
  // Lints every `package.json` in the workspace: required fields, sorted dependencies,
  // valid name pattern, no duplicates. Catches the kinds of mistakes that previously
  // surfaced only when `pnpm publish --dry-run` ran in CI.
  packageJson.configs.recommended,
)
