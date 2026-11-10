# Publishing

How changes reach npm. The index is [AGENTS.md](../AGENTS.md); see also [getting started](./getting-started.md) and [architecture](./architecture.md).

## Changesets

A PR that changes a published package adds a hand-written `.changeset/<kebab-name>.md`; `pnpm changeset` walks you through it. Pick the bump with the table in [Versioning (lockstep)](../AGENTS.md#versioning-lockstep). Docs-only and website-only PRs need none.

## Lockstep versioning

`.changeset/config.json` sets `fixed: [["projitect", "@projitect/*"]]`, so every published package shares one version whichever package an entry names. `apps/website` is private and listed under `ignore`.

## Shipping a release

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on every push to `main`:

1. `changesets/action` looks for `.changeset/*.md` files and opens or updates a `chore(release): version packages` PR that applies them with `pnpm version-packages`.
2. Merging that PR runs the workflow again, which runs `pnpm release` (`pnpm build`, then `changeset publish`), publishing every package in the `fixed` group with npm provenance (`NPM_CONFIG_PROVENANCE=true`).

Only the release job runs on Node 24 with `npm@^11.5.1`, because npm trusted publishing needs npm >= 11.5.1 and Node >= 22.14.0. `.nvmrc` and `engines.node` (`>=22.12.0`) are unchanged. The job keeps `id-token: write` for OIDC and provenance. The owner-approved first-release exception below supplies a temporary token through an Actions secret; credential values never belong in source.

When the publish succeeds (`published == 'true'`), a follow-up step runs [`scripts/comment-released.ts`](../scripts/comment-released.ts): it comments "Shipped in projitect vX.Y.Z" on each PR in the release (the commits since the previous `projitect@*` tag) and on the issues those PRs close. A hidden `<!-- pjt-release:vX.Y.Z -->` marker makes re-runs skip anything already commented, and a failed comment is logged without failing the job. Preview with `pnpm release:comment --dry-run` (needs `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PUBLISHED_PACKAGES`).

Agents never publish directly: there is no interactive `changeset publish` step to run by hand, only the changeset file that feeds the gated workflow above. The `release-bump` skill in `.claude/skills/release-bump/` walks through cutting a release.

## License

The MIT copyright holder is Kapil Easwar (owner-confirmed): `LICENSE` reads "Copyright (c) 2026 Kapil Easwar" at the root and in every package, and `check-packs.sh` fails if a package copy differs.

## Authentication

Trusted publishing (OIDC from GitHub Actions) is the steady-state path. On 2026-11-10 the owner confirmed the `projitect` npm organization exists with no packages and approved a short-lived token for the first real GitHub workflow release. Public lookup of the unscoped `projitect` package returned E404; that alone does not prove name availability or account permissions.

[npm requires an existing package before configuring trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites). Creating a placeholder or publishing locally to get past that requirement is not allowed. Instead, the release step temporarily reads the repository secret `PROJITECT_FIRST_RELEASE_NPM_TOKEN` as both `NPM_TOKEN` (Changesets) and `NODE_AUTH_TOKEN` (the registry configuration from setup-node). It is not supplied to dependency installation, the preceding build, release comments or PR CI. With the secret absent, the workflow retains its OIDC path; absence does not establish that npm trust is configured.

## Owner-only setup checklist

Only the owner performs account, token and trusted-publisher setup. The first real publish creates the package records; OIDC configuration follows it.

### Before the first release

1. Confirm the account can create public packages in `@projitect` and publish the unscoped `projitect` CLI. The organization page alone does not establish those permissions. Use the `name` fields of every non-private `packages/*/package.json` as the release inventory, not directory names.
2. In npm **Access Tokens → Generate New Token**, create a granular token named `projitect-first-release`, expiring in one day. Under **Packages and scopes**, choose **Read and write (publish and stage)** and the smallest selection that covers the new `@projitect/*` packages and unscoped `projitect`. Do not silently broaden access to unrelated packages if the UI cannot select the unpublished CLI name; resolve that permission choice with the owner. **Organizations** access can remain **No access**: it manages teams/settings and does not grant package publishing. Enable **Bypass two-factor authentication** for unattended publishing; keep account 2FA enabled. See [npm's token settings](https://docs.npmjs.com/creating-and-viewing-access-tokens/).
3. Put the token directly into [repository Actions secrets](https://github.com/projitect/projitect/settings/secrets/actions/new), named `PROJITECT_FIRST_RELEASE_NPM_TOKEN`. Never paste it into chat, task documents, a command argument or a tracked file. Report only that the secret is installed and its expiration time.
4. After exact-head checks and tarball checks pass, merge the version PR and watch the GitHub release workflow. This publishes the actual reviewed packages with provenance. A failed or partial run requires inspecting the registry per package before retrying; published versions cannot be overwritten. Never disable provenance to force a release through.

### After the first release

1. Verify every package's exact released version and provenance, then the public-registry journey below.
2. For each real package, configure a GitHub Actions trusted publisher: owner `projitect`, repository `projitect`, workflow `release.yml`. Explicitly allow **direct publishing** for this workflow: new configurations default to stage-only, which does not authorize `changeset publish`. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). Configure trust promptly before the next release; a saved configuration is not proof of working OIDC.
3. Remove both temporary token environment entries from `release.yml`, delete the Actions secret and revoke the npm token. Keep `id-token: write` and provenance. Do not retain a fallback credential for future releases.
4. Verify the next genuine release uses OIDC and succeeds for every package; do not publish a dummy version to test it. If it fails, repair trust rather than reintroducing a token without owner approval.

## Preflight

Before the owner merges the first release PR:

1. The **Before the first release** checklist above is complete for every published package. Later releases require configured OIDC trust instead of the temporary token.
2. `pnpm build` then `./scripts/check-packs.sh` pass (every tarball has `dist/` and a LICENSE matching the root one, one shared version, correct `repository`). CI runs this in `publish-dry-run`.
3. On the first release, watch the release job: `npm --version` must log >= 11.5.1, and the publish step must not fail with an auth error (E401/E403/E404).

## Release confirmation

A green version-PR job is not confirmation. The release is confirmed only when the public registry returns the released version for both `pnpm view projitect version` and `pnpm view @projitect/core version`.

## Verifying release and website state without gh

When an agent environment has no `gh` or credentials, use the public read-only checks below. Commands marked _verified_ were run on 2026-11-10; the remaining checks were not run in that build environment and are marked _unverified_. These observations are dated evidence, not a claim about the current release state.

### Release PR and `release.yml` run

Unauthenticated GitHub access is limited to 60 requests an hour per IP, so fetch sparingly.

- Version PR (`chore(release): version packages`): open `https://github.com/projitect/projitect/pulls?q=is%3Apr+%22chore%28release%29%3A+version+packages%22`, or `curl -fsS 'https://api.github.com/repos/projitect/projitect/pulls?state=all&per_page=100'` and read `title`, `state`, `merged_at`. Follow the response's pagination links if the matching PR is not on that page. _Unverified._
- Release run: open `https://github.com/projitect/projitect/actions/workflows/release.yml`, or `curl -fsS 'https://api.github.com/repos/projitect/projitect/actions/workflows/release.yml/runs?per_page=5'` and read `status`, `conclusion`, `head_sha`. _Unverified._

### Registry

`pnpm view projitect version` and `pnpm view @projitect/core version` (see [Release confirmation](#release-confirmation)). Registry state, not a green workflow run, confirms a release. For provenance, query the exact version with `pnpm view projitect@<released-version> dist.attestations`; a missing package or version returns a registry error, while a missing attestations field supplies no provenance evidence. _Verified on 2026-11-10:_ both version commands returned `E404 ... is not in this registry`, so no public release was found. The provenance command was not run, as there was no published version to query.

### Website hosting and commit served

The repo proves no host: there is no deploy workflow (only `ci.yml` and `release.yml`) and no host config. `apps/website/astro.config.mjs` sets `site: https://projitect.dev`, and `BACKLOG.md` lists the Vercel project (OPS-8) and the projitect.dev domain as planned and unchecked. Treat the host and the deploy trigger as **unconfirmed** until a deploy mechanism lands.

No mechanism reports which commit the site serves (there is no build stamp, and none is built here). The best read-only comparison is to fetch a built page or an asset and diff it against the source at the merged commit, for example `apps/website/public/schemas/inspect.v1.json`.

### Published asset check

`curl -sS -o /dev/null -w '%{http_code}\n' https://projitect.dev/schemas/inspect.v1.json` must print `200`, and `curl -fsS -o inspect.v1.json https://projitect.dev/schemas/inspect.v1.json` followed by `python3 -m json.tool inspect.v1.json` must parse. A pass is HTTP 200 and valid JSON. If it fails, record the status code, the response headers (`curl -sSI`) and the UTC time, then check hosting/domain setup (OPS-8/OPS-9) and whether the asset was deployed. _Unverified._

### First public release pass

The release or deploy agent runs this after the publish, in a throwaway git project outside the repo, with pnpm only (never `npx pjt`):

1. `git init`, then `pnpm add -D projitect@<released version>` from the public registry.
2. `pnpm exec pjt init`, then add the markdown and skills blueprints and run `pnpm exec pjt remodel`.
3. `pnpm exec pjt inspect` exits 0. Hand-edit a managed region: `pnpm exec pjt inspect` exits nonzero and reports the drift.
4. Exercise upgrade, swap and remove where they apply, the way `./scripts/smoke.sh` does.

It passes when every step behaves as stated and `pnpm view` returns the released version (with provenance) for every package in the `fixed` group. _Unverified on 2026-11-10:_ no public version was available for this journey.

The missing npm owner setup is tracked by the [Owner-only setup checklist](#owner-only-setup-checklist) and the first-release task. It does not block these instructions.

## Dependency upgrades (Renovate)

Renovate runs on this repo and opens PRs for dep upgrades. Configured at [renovate.json5](../renovate.json5). Two things to know:

- Most packages are published libraries, so the default `rangeStrategy` is `update` (caret/tilde ranges preserved — consumers dedupe). The workspace root `package.json` and `apps/website/package.json` are private, so they pin exact versions via `matchFileNames` overrides.
- Non-major bumps, devDep majors, and lockfile maintenance auto-merge. Runtime-dep majors (Effect v3 → v4, etc.) wait for human approval. PRs queue for `minimumReleaseAge` (3-8 days depending on dep type) to dodge the npm 72-hour unpublish window.

When adding a new published `@projitect/*` package: nothing to do — it inherits the default js-lib semantics. When adding a new `apps/*` private package: extend the `matchFileNames` rule to include it.
