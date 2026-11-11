# Publishing

How changes reach npm. The index is [AGENTS.md](../AGENTS.md); see also [getting started](./getting-started.md) and [architecture](./architecture.md).

## Changesets

A PR that changes a published package adds a hand-written `.changeset/<kebab-name>.md`; `pnpm changeset` walks you through it. Pick the bump with the table in [Versioning (lockstep)](../AGENTS.md#versioning-lockstep). Docs-only and website-only PRs need none.

## Lockstep versioning

`.changeset/config.json` sets `fixed: [["@projitect/*"]]`, so every published package shares one version whichever package an entry names. `apps/website` is private and listed under `ignore`.

## Shipping a release

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on every push to `main`:

1. `changesets/action` looks for `.changeset/*.md` files and opens or updates a `chore(release): version packages` PR that applies them with `pnpm version-packages`.
2. Merging that PR runs the workflow again, which runs `pnpm release` (`pnpm build`, then `changeset publish`), publishing every package in the `fixed` group with npm provenance (`NPM_CONFIG_PROVENANCE=true`).

Only the release job runs on Node 24 with `npm@^11.5.1`, because npm trusted publishing needs npm >= 11.5.1 and Node >= 22.14.0. `.nvmrc` and `engines.node` (`>=22.12.0`) are unchanged. The job keeps `id-token: write` for OIDC and provenance. The first release used a temporary token from an Actions secret (see [Authentication](#authentication)); credential values never belong in source.

Agents never publish directly: there is no interactive `changeset publish` step to run by hand, only the changeset file that feeds the gated workflow above. The `release-bump` skill in `.claude/skills/release-bump/` walks through cutting a release.

### Release job permissions

The release job holds exactly these `GITHUB_TOKEN` permissions:

- `contents: write` — push the version PR branch and the release tags.
- `pull-requests: write` — open or update the version PR and comment on released PRs.
- `issues: write` — comment on the issues the released PRs close.
- `id-token: write` — OIDC for npm trusted publishing and provenance.

Release automation that posts comments may use `issues: write` only in the release job, only after a successful publish (`published == 'true'`), and only with the built-in `GITHUB_TOKEN`. Such a step is best-effort (`continue-on-error: true`), so a comment failure never fails the publish. No new token or credential is allowed.

### How a release maps to GitHub

After a successful publish, [`scripts/comment-released.ts`](../scripts/comment-released.ts) comments "Shipped in projitect vX.Y.Z". The commits since the previous `@projitect/cli@*` tag give the PRs in the release; the issues those PRs close (`Fixes #…` or `Closes #…` in the PR) are included. A hidden `<!-- pjt-release:vX.Y.Z -->` marker makes re-runs skip anything already commented.

GitHub issues are a supported work channel alongside the optional Trello board. The `[kanban #…]` commit suffix is not required for work tracked as a GitHub issue; see the [Kanban overview](./kanban/overview.md) for the board.

### Local release-notes preview

Preview the changelog a version PR would produce without publishing anything. `@changesets/changelog-github` calls the GitHub API, so the maintainer supplies a personal `GITHUB_TOKEN`; agents are not given one. Run it only in a disposable worktree, never in your own checkout, so uncommitted work cannot be discarded:

1. `git worktree add --detach <tmp> HEAD`, then `pnpm install` inside `<tmp>`.
2. In `<tmp>`, run `pnpm version-packages` (`changeset version`, the command the version PR runs) and read the diff.
3. Discard only what that run generated. List it with `git status --porcelain`, then run `git restore --source=HEAD --staged --worktree -- <those paths>`. Tracked paths (` M`/` D`) are the consumed `.changeset/*.md` files, the `version` fields in `package.json` files, existing `CHANGELOG.md` files, and `pnpm-lock.yaml` if touched; restore them with that command. A `CHANGELOG.md` that did not exist yet shows as untracked (`??`), which `git restore` cannot touch: delete each by name with `rm`. Name files explicitly; never restore a whole directory such as `packages`, and never `.`.
4. `git worktree remove --force <tmp>`.

Do not use `git stash`, `git reset --hard` or `git clean -fd` as shortcuts: the stash stack is shared across worktrees, and the other two destroy unrelated work.

To preview the release comments, run `pnpm release:comment --dry-run` (needs `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PUBLISHED_PACKAGES`).

### Snapshot publishes

No snapshot-publish workflow exists today, and adding one is an owner decision; the feature is tracked as it-0379ce2e, which also owns snapshot security and account activation. Until the owner decides, these are constraints, not enabled behaviour (each is pending the owner's decision):

- Fork PRs get no secrets and cannot publish.
- `pull_request_target` is not used to run PR code.
- Only maintainers with write access may apply a trigger label.
- Snapshots, if added, must be published with npm provenance.

## License

The MIT copyright holder is Kapil Easwar (owner-confirmed): `LICENSE` reads "Copyright (c) 2026 Kapil Easwar" at the root and in every package, and `check-packs.sh` fails if a package copy differs.

## Authentication

Every published package is under `@projitect`, including the CLI package `@projitect/cli`; the command it installs remains `pjt`. Version 1.0.1 of all 14 packages is public (see [Release confirmation](#release-confirmation)).

The first real release used a temporary token. The owner installed it as the repository secret `PROJITECT_FIRST_RELEASE_NPM_TOKEN`, and its value was never read or printed. The release step reads that secret as both `NPM_TOKEN` (Changesets) and `NODE_AUTH_TOKEN` (the registry configuration from setup-node). It is not supplied to dependency installation, the preceding build, release comments or PR CI. Creating a placeholder or publishing locally is not allowed; [npm requires an existing package before configuring trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites), which is why the first release needed the token.

Steady-state trusted publishing (OIDC from GitHub Actions) is **not yet configured or verified**. Until the owner completes the steps below and a genuine release succeeds through OIDC, treat the token as the only proven publish path.

## Owner-only setup checklist

Only the owner performs account, token and trusted-publisher setup. The first release is done; the steps below are pending.

1. For each of the 14 `@projitect` packages (the `name` fields of every non-private `packages/*/package.json`), configure a GitHub Actions trusted publisher: owner `projitect`, repository `projitect`, workflow `release.yml`, environment blank. Explicitly allow **direct publishing**: new configurations default to stage-only, which does not authorize `changeset publish`. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). npm's current docs require the first successful OIDC publish within 2 days of configuration, so configure trust shortly before the next genuine release. A saved configuration is not proof of working OIDC.
2. Coordinate one cleanup before that release: remove both temporary token environment entries from `release.yml`, delete the `PROJITECT_FIRST_RELEASE_NPM_TOKEN` Actions secret, and revoke the npm token. Keep `id-token: write` and provenance. Do not retain a fallback credential.
3. Verify the next genuine release uses OIDC and succeeds for every package. No artificial publish or test version bump proves OIDC. If it fails, repair trust rather than reintroducing a token without owner approval.

Publishing is never done locally, and a merged PR does not mean released.

An agent environment needs public registry and GitHub read access but no npm publish credentials.

## Preflight

Before the owner merges a release PR:

1. `pnpm build` then `./scripts/check-packs.sh` pass (every tarball has `dist/` and a LICENSE matching the root one, one shared version, correct `repository`). CI runs this in `publish-dry-run`.
2. Watch the release job: `npm --version` must log >= 11.5.1, and the publish step must not fail with an auth error (E401/E403/E404).
3. Open advisories are triaged per [Security advisories](#security-advisories); any accepted material risk has the owner's sign-off.

## Release confirmation

A merge or a green job is not confirmation. A release is confirmed only by registry state: the public registry returns the released version for every public package, starting with `pnpm view @projitect/cli version` and `pnpm view @projitect/core version`.

Version 1.0.1 of all 14 `@projitect` packages is publicly available. The evidence is release PR #103, merged as `090ac4325c00c10cab821d51c045483abbaae16c`, and the successful `release.yml` [run 42895755432](https://github.com/projitect/projitect/actions/runs/42895755432). Verified for 1.0.1:

- Downloaded tarballs match their sha512 digests.
- The root MIT license names Kapil Easwar, and the tarballs contain built `dist/`.
- The `repository` field is the canonical GitHub slug.
- All 14 provenance payload subjects match the tarball digests and bind `release.yml`, commit `090ac432` and run 42895755432. This is a payload-binding check; it does not claim independent cryptographic signature validation.

The `/private/tmp` directories used for these checks were non-portable local verification records and are not linked.

### Recovering a partial release

Inspect the actual registry inventory before retrying a failed workflow. A successful publish is immutable; never unpublish it or attempt to overwrite the version as a recovery shortcut. Check every package, its exact version, tarball integrity and provenance, rather than inferring registry state from the job's exit code.

An absent installable version does not mean its number is available. On 2026-11-10, the first `1.0.0` workflow reported thirteen successful publishes and rejected `@projitect/cli@1.0.0` because that version had been published in 2019 and unpublished in 2021, so the first CLI 1.0.0 was retired. The full public registry document at `https://registry.npmjs.org/@projitect%2fcli` retained those timestamps under `time`, including `time.unpublished`, while the version lookup returned E404. npm permanently reserves unpublished version numbers. That attempt did not complete the release; recovery PR #102 and bootstrap PR #104 are now released as 1.0.1.

For a retired version, add a patch changeset and let the ordinary version PR advance every public package together. Before merging it, inspect the registry's `versions` and `time` records for every package to confirm the proposed number is neither published nor retired. Keep the same exact-head checks and workflow-only publication. For a transient failure involving an available version, retry only after inspecting which packages were actually published; do not blindly rerun a partial publish.

## Verifying release and website state without gh

When an agent environment has no `gh` or credentials, use the public read-only checks below. Commands marked _verified_ were run on the stated UTC date. Checks marked _unverified_ or _not verified_ carry the reason beside them. These observations are dated evidence, not a claim about the current release state.

`jq` is not guaranteed in agent environments. Save the response to a throwaway path outside the repo and read fields with `python3 -I` (or a similar tool the image has), for example:

```sh
curl -fsS 'https://api.github.com/repos/projitect/projitect/pulls?state=all&per_page=100' -o /tmp/pulls.json
python3 -I -c "import json;d=json.load(open('/tmp/pulls.json'));print([(p['title'],p['state'],p['merged_at']) for p in d if 'version packages' in p['title']])"
```

### Release PR and `release.yml` run

Unauthenticated GitHub access is limited to 60 requests an hour per IP, so fetch sparingly.

- Version PR (`chore(release): version packages`): open `https://github.com/projitect/projitect/pulls?q=is%3Apr+%22chore%28release%29%3A+version+packages%22`, or `curl -fsS 'https://api.github.com/repos/projitect/projitect/pulls?state=all&per_page=100'` and read `title`, `state`, `merged_at`. A full page of 100 means the matching PR may be on a later page: follow the `Link` header. _Verified at 2026-11-10 21:16 UTC:_ HTTP 200, JSON parsed with `python3 -I`, and 100 PRs returned. Version PR #106 was open; #103 was merged at `2026-11-10T20:29:15Z`, and #40 at `2026-11-10T19:26:58Z`.
- Release run: open `https://github.com/projitect/projitect/actions/workflows/release.yml`, or `curl -fsS 'https://api.github.com/repos/projitect/projitect/actions/workflows/release.yml/runs?per_page=5'` and read `status`, `conclusion`, `head_sha`. _Verified at 2026-11-10 21:16 UTC:_ HTTP 200, JSON parsed with `python3 -I`, and all five returned runs were completed with `success`. This includes [run 42895755432](https://github.com/projitect/projitect/actions/runs/42895755432), which published 1.0.1 from commit `090ac4325c00c10cab821d51c045483abbaae16c`. Other successful runs only updated the version PR; inspect the registry to distinguish those outcomes.

### Registry

Use `pnpm view @projitect/cli version` and `pnpm view @projitect/core version` (see [Release confirmation](#release-confirmation)), then verify every public package at the exact proposed version. For provenance, query `pnpm view @projitect/cli@<released-version> dist.attestations`; a missing package or version returns a registry error, while a missing attestations field supplies no provenance evidence.

_Verified at 2026-11-10 21:16 UTC:_ `pnpm view <package>@1.0.1 version dist.attestations --json` returned version `1.0.1` and a SLSA provenance URL for all 14 public `@projitect/*` packages in the [package inventory](../AGENTS.md#what-this-repo-is). Downloaded tarballs matched their advertised SHA-512 integrity, contained built output and the root MIT license, and named the canonical repository. Their provenance payloads matched the tarball digests and identified the release workflow, commit and run above. This payload-binding check did not independently validate cryptographic signatures. A dated historical observation, superseded by this result: earlier on 2026-11-10, before publication, probes returned E404.

### Website hosting and commit served

The repository contains `ci.yml` and `release.yml`, with no website deploy workflow or host configuration. `apps/website/astro.config.mjs` sets `site: https://projitect.dev`, and `BACKLOG.md` lists the Vercel project (OPS-8) and domain (OPS-9) as planned and unchecked. The host and deploy trigger remain **unconfirmed**. A probe from this verification environment at 2026-11-10 21:16 UTC failed to resolve `projitect.dev`; it could not verify a host or served commit.

No mechanism reports which commit the site serves (there is no build stamp, and none is built here). The best read-only comparison is to fetch a built page or an asset and diff it against the source at the merged commit, for example `apps/website/public/schemas/inspect.v1.json`.

### Published asset check

`curl -sS -o /dev/null -w '%{http_code}\n' https://projitect.dev/schemas/inspect.v1.json` must print `200`, and `curl -fsS -o inspect.v1.json https://projitect.dev/schemas/inspect.v1.json` followed by `python3 -m json.tool inspect.v1.json` must parse. A pass is HTTP 200 and valid JSON. If it fails, record the response headers and UTC time, then check hosting/domain setup (OPS-8/OPS-9) and whether the asset was deployed. _Not verified at 2026-11-10 21:16 UTC:_ curl exited 6 with `Could not resolve host: projitect.dev`. Its `000` output represented the absence of an HTTP response; no HTTP status, response headers or JSON were received. This is an observation from the verification environment, with global DNS and hosting state still unconfirmed.

### First public release pass

The release or deploy agent runs this after the publish, in a throwaway git project outside the repo, with pnpm only (never `npx pjt`):

1. `git init`, then `pnpm add -D @projitect/cli@<released version>` from the public registry.
2. `pnpm exec pjt init`, then add the markdown and skills blueprints. Configure a complete skills call with a stable namespaced `id`, the author package's `version`, skill names and files before running `pnpm exec pjt remodel`. In 1.0.1 the generated default skills-helper call omits the required `id` and `version`; supply them before applying.
3. `pnpm exec pjt inspect` exits 0. Hand-edit a managed region: `pnpm exec pjt inspect` exits nonzero and reports the drift.
4. Exercise upgrade, swap and remove where they apply, the way `./scripts/smoke.sh` does.

It passes when every step behaves as stated and registry metadata returns the released version with provenance for every public package. _Verified for 1.0.1 on 2026-11-10:_ a fresh project on Node 22.12 completed public-registry `pnpm --package=@projitect/cli@1.0.1 dlx pjt init --yes`, a frozen offline install, local inspect/remodel, a real Markdown package upgrade from 1.0.0 to 1.0.1, snippet swap/removal preserving user text, and a complete skills call with referenced assets. Managed Markdown and skill-file edits produced JSON drift reports and exit 1; remodel restored the files and inspect returned 0. A version-only Markdown upgrade records an upgrade but exits 0 when file content is unchanged; this matches the current `inspect` contract and waives no check.

Per-package trusted-publisher setup, credential cleanup and verification of a token-free release are pending; see the [Owner-only setup checklist](#owner-only-setup-checklist).

## Dependency upgrades (Renovate)

Renovate runs on this repo and opens PRs for dep upgrades. Configured at [renovate.json5](../renovate.json5). Two things to know:

- Most packages are published libraries, so the default `rangeStrategy` is `update` (caret/tilde ranges preserved — consumers dedupe). The workspace root `package.json` and `apps/website/package.json` are private, so they pin exact versions via `matchFileNames` overrides.
- Non-major bumps, devDep majors, and lockfile maintenance auto-merge. Runtime-dep majors (Effect v3 → v4, etc.) wait for human approval. PRs queue for `minimumReleaseAge` (3-8 days depending on dep type) to dodge the npm 72-hour unpublish window.

When adding a new published `@projitect/*` package: nothing to do — it inherits the default js-lib semantics. When adding a new `apps/*` private package: extend the `matchFileNames` rule to include it.

## Security advisories

### Listing open advisories (no `gh`, no token)

Run `pnpm audit --json`. It queries the registry's advisory service for the current lockfile. Its coverage and observation time can differ from GitHub's dependency graph and Dependabot alerts; a clean audit does not prove the repository has no open alerts. Read these fields: `advisories` (one entry per advisory), `actions`, `muted`, and the per-severity counts in `metadata.vulnerabilities`. Report the result as a table with the columns package, severity, advisory id, vulnerable range, fixed version and path.

Where bare `pnpm` is absent, `corepack pnpm audit --json` is the intended form. It is **unverified**: corepack failed signature verification when it was tried in one agent environment, so whether it works elsewhere is unknown.

Where `gh` and authorized access are available, read the open Dependabot records with `gh api 'repos/projitect/projitect/dependabot/alerts?state=open&per_page=100' --paginate`. Those records are the source of truth for GitHub alert state. An alert list that could not be read (no network, no permission, a failed command) is reported as **unknown**, never as clean.

### Triage record

For each advisory, record the affected lockfile version, whether it is reachable at runtime, build time or dev time, the fixed version, and the regression checks run. Judge reachability from how the package is actually used, not from which dependency block lists it.

### Overrides

A transitive fix may use `overrides` in `pnpm-workspace.yaml` only when the upstream parent cannot take the fixed version or has not released it yet, and the override stays within that parent's declared semver range (check the parent's `package.json`, do not assume). Each entry carries a comment naming the advisory ids and the parent package, as the existing entries do.

Retire an override once the parent depends on a fixed version: remove it, then confirm the lockfile still resolves fixed versions and the audit stays clean.

### What clears an alert

For a dependency fix, the lockfile resolves a fixed version, a re-run of the audit no longer lists the advisory, and `pnpm check-all` passes. Separately verify the corresponding GitHub alert state after GitHub processes the merged dependency graph; a local audit does not close or dismiss it. An alert dismissed as not applicable needs a recorded reason.

### Release impact

There is no blanket exemption for exposure in the private site or in dev dependencies, and no blanket block on every alert. Assess actual exploitability and the shipped or build impact of each advisory: what the published tarballs contain, and what runs in CI and release builds. Accepting a material risk is escalated to the owner, not decided by the agent. This feeds item 4 of the [Preflight](#preflight) list.
