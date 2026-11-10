# .ampm

This folder is where this repository tailors how ampm's agents work on it. `AGENTS.md` stays the
source of truth for engineering rules; anything added here customizes ampm's own behavior on top of
it. See <https://ampm.dev/docs/repo-customization.md> for what can go here.

Agents usually cannot fetch ampm.dev, so this guide records what this repo's own files show. Where a
detail lives only upstream, it says so.

## environment.json (version 2)

`environment.json` declares the agent sandbox environment. The canonical schema is
<https://ampm.dev/docs/sandbox-environment.md>; it is not copied here. Which ampm steps use a
profile is defined upstream on that page. This file defines only the `default` profile.

| Field                        | Meaning                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                    | Schema version, `2`.                                                                                                                     |
| `profiles.<name>`            | A named environment. Only `default` exists here; steps without a more specific profile use it.                                           |
| `backends`                   | Backends the profile can run on. Here `["docker"]`.                                                                                      |
| `docker.dockerfile`          | Path to the Dockerfile, relative to the repo root: `.ampm/Dockerfile`.                                                                   |
| `docker.context`             | Docker build context: `.ampm`.                                                                                                           |
| `resources.minimumMemoryMiB` | Memory the sandbox needs at minimum (here 2048).                                                                                         |
| `checks[]`                   | Commands run in the built image to prove it works: `name`, `argv` (the command), `expectedExitCode` (pass when it exits with this code). |
| `checks[].provides`          | What a passing check proves: `{ "kind": "tool", "name": "pnpm" }`. Tasks are told which tools the environment provides.                  |
| image reference              | This file sets none; the image is built from the Dockerfile. The field for using a prebuilt image is documented upstream.                |

Worked example, copied from this repo's file:

```json
{
  "version": 2,
  "profiles": {
    "default": {
      "backends": ["docker"],
      "docker": { "dockerfile": ".ampm/Dockerfile", "context": ".ampm" },
      "resources": { "minimumMemoryMiB": 2048 },
      "checks": [
        {
          "name": "pnpm",
          "argv": ["bash", "-c", "test \"$(pnpm --version)\" = \"10.33.4\""],
          "expectedExitCode": 0,
          "provides": [{ "kind": "tool", "name": "pnpm" }]
        }
      ]
    }
  }
}
```

## Dockerfile contract

- It lives at `.ampm/Dockerfile`; the build context is `.ampm`.
- The image ships every tool the checks prove: `node`, `pnpm`, `curl` and `python3`. It also ships
  `bash`, `git` and `ca-certificates`.
- It runs as a non-root user (`USER node`). Its last `RUN` proves, as that user and offline, that
  the pinned pnpm and node work.

## How pnpm is provisioned

The image installs pnpm globally at the root `package.json` `packageManager` pin, and the final
`RUN` proves it works offline for the non-root user. The drift test
`packages/cli-internals/test/ampm-ci-evidence.test.ts` fails when the pins fall out of step. Bump
these together: the Dockerfile `node:` tag and `pnpm@` version, the `pnpm` check in
`environment.json`, the root `packageManager`, and `.nvmrc`.

The nvm and corepack ladder in the Package manager section of `AGENTS.md` is the fallback for
environments that are not this image.

### Why a default `corepack enable` fails

`corepack enable` writes its shims to `/usr/local/bin`, which the non-root sandbox user cannot
write. Use one of the supported routes: the image-shipped pnpm, or
`corepack enable --install-directory <dir>` with a writable directory.

## Checking an image change without Docker

Agent sandboxes have no Docker; building the image needs Docker on a human's machine.

1. Run `pnpm test packages/cli-internals/test/ampm-ci-evidence.test.ts`.
2. Read the Dockerfile and the check `argv` against the pins (`packageManager`, `.nvmrc`).

Passing both makes the image **locally tested**, which is not the same as the human-approved
**active** image. Activating a new environment is a human-only step; agents never do it.

## ci-evidence.json

`ci-evidence.json` names the check runs ampm reads as CI evidence for a PR head. Upstream format:
<https://ampm.dev/docs/landing-policy.md>.

- `checks[]` holds `name` and `app`; `app` is `github-actions` here.
- `name` equals the job name in `.github/workflows/ci.yml`. A matrix job expands with a suffix, so a
  job `test` over Node 22 and 24 yields `test (node 22)` and `test (node 24)`.
- Every listed check must pass. A check that is missing reads as unavailable.
- Fail-closed behaviour is configured upstream, not in this repo; see the landing-policy page.
- The same drift test file keeps the list equal to the jobs `ci.yml` produces.
