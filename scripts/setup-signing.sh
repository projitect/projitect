#!/usr/bin/env bash
#
# setup-signing.sh
#
# Ensures every commit in this repo is signed with the dedicated "Claude Code"
# SSH key, so commits land with the green "Verified" badge on GitHub. Idempotent.
#
# When this runs:
#   - Automatically: the `SessionStart` hook in .claude/settings.json fires this
#     on every agent session start. That's the "never forget" guarantee — signing
#     is configured before the first commit of the session, without anyone having
#     to remember.
#   - Manually: run `bash scripts/setup-signing.sh` if signing ever stops working
#     (e.g. after a fresh clone, which doesn't carry repo-local git config).
#
# How this differs from StoryCut:
#   StoryCut rewrites the *author identity* to "Claude Code (<contributor>)" via
#   per-worktree config, gated on `claude/*` / `agent/*` branches. projitect keeps
#   the contributor's normal authorship and configures *signing only*, repo-local,
#   on every branch. The goal here is the Verified badge on every commit, not a
#   separate author identity. (If we ever want Claude-authored commits, switch to
#   StoryCut's worktree-gated approach — see docs/agents-signing.md.)
#
# Where the key comes from:
#   The signing key + allowed-signers file are read from ~/.gitconfig.claude (the
#   per-machine agent identity file, shared with StoryCut). If that file is absent,
#   we fall back to the conventional paths. If no key is found at all, we print a
#   one-line hint and exit 0 — never blocking a session or a CI install.

set -euo pipefail

# Not in a git work tree (e.g. a published tarball running its own scripts)? Nothing to do.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

identity_file="$HOME/.gitconfig.claude"
default_key="$HOME/.ssh/git_signing_claude.pub"
default_allowed="$HOME/.config/git/allowed_signers"

signingkey=""
allowed=""
if [[ -f "$identity_file" ]]; then
  signingkey=$(git config --file "$identity_file" --get user.signingkey 2>/dev/null || true)
  allowed=$(git config --file "$identity_file" --get gpg.ssh.allowedSignersFile 2>/dev/null || true)
fi
signingkey="${signingkey:-$default_key}"
allowed="${allowed:-$default_allowed}"

# Expand a leading ~ so the existence check resolves.
expanded_key="${signingkey/#\~/$HOME}"
if [[ ! -f "$expanded_key" ]]; then
  echo "projitect: no SSH signing key at '$signingkey' — commits will be UNSIGNED."
  echo "           One-time setup is documented in docs/agents-signing.md."
  exit 0
fi

changed=0
ensure() {
  local key="$1" want="$2" have
  have=$(git config --local --get "$key" 2>/dev/null || true)
  if [[ "$have" != "$want" ]]; then
    git config --local "$key" "$want"
    changed=1
  fi
}

ensure gpg.format ssh
ensure user.signingkey "$signingkey"
ensure commit.gpgsign true
ensure tag.gpgsign true
[[ -n "$allowed" ]] && ensure gpg.ssh.allowedSignersFile "$allowed"

if [[ "$changed" -eq 1 ]]; then
  echo "projitect: commit signing configured (SSH key: $signingkey)"
fi
exit 0
