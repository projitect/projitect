# .ampm

This folder is where this repository tailors how ampm's agents work on it. `AGENTS.md` stays the
source of truth for engineering rules; anything added here customizes ampm's own behavior on top of
it.

See <https://ampm.dev/docs/repo-customization.md> for what can go here.

- `ci-evidence.json` names the GitHub Actions check runs ampm reads as CI evidence for a PR head
  (format: <https://ampm.dev/docs/landing-policy.md>). Every listed check must pass; a missing
  check reads as unavailable. The list must match the jobs in `.github/workflows/ci.yml` — a test
  in `packages/cli-internals` fails when they drift.
