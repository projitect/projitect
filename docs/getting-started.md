# Getting started

From a fresh clone to a green `pnpm check-all`. The rules live in [AGENTS.md](../AGENTS.md); this page is the short path through them. Next: [architecture](./architecture.md), [publishing](./publishing.md).

## 1. Node

Node is pinned in `.nvmrc` to 22.12.0. Run `nvm use`. See [Node version](../AGENTS.md#node-version).

## 2. Install with pnpm

This repo uses pnpm only — never npm, yarn or bun. If `pnpm` is not found, follow the escalation order in [Package manager](../AGENTS.md#package-manager).

```sh
pnpm install
```

The `prepare` script installs the husky hooks and patches TypeScript with the Effect language service, so `tsc --build` reports Effect diagnostics. See [Effect language service](./tooling.md#effect-language-service).

## 3. Run the gate

```sh
pnpm check-all
```

It runs `pnpm tc`, `pnpm lint`, `pnpm test` and `pnpm knip`, in that order. See [Verification ritual](../AGENTS.md#verification-ritual).

## 4. Build for the extra CI checks

CI also runs three checks that need built packages. Run `pnpm build` first, then:

- `pnpm --filter website check:examples`
- `pnpm --filter website check:errors`
- `./scripts/smoke.sh`

## Formatting and hooks

`pnpm lint:fix` applies ESLint and Prettier fixes. `pnpm format` runs Prettier on markdown, YAML, JSON5 and CSS. Commits run `lint-staged`; see [Pre-commit hooks](./tooling.md#pre-commit-hooks-husky--lint-staged). When a check fails, fix the cause — see [No destructive shortcuts](../AGENTS.md#no-destructive-shortcuts). Agents should also read [Permission-prompt posture](../AGENTS.md#permission-prompt-posture-command-shape).
