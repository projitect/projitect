# Signed commits — one-time machine setup

Commits in this repo are signed with a dedicated **"Claude Code" SSH key**, so they land with the
green **Verified** badge on GitHub. After this one-time-per-machine setup, signing is automatic:
the `SessionStart` hook in [`.claude/settings.json`](../.claude/settings.json) keeps the repo
configured (via [`scripts/setup-signing.sh`](../scripts/setup-signing.sh)) and git signs every
commit. See [How signing stays configured](#how-signing-stays-configured) for how that automation works.

**If your commits already show Verified, you're done — skip this.**

Every commit in this repo is signed. You (the agent) do **not** decide whether to sign — git does it for you because `commit.gpgsign=true` is configured, and the [`scripts/setup-signing.sh`](../scripts/setup-signing.sh) helper keeps that config in place. You should never need a reminder to sign.

## How signing stays configured

- The `SessionStart` hook in [`.claude/settings.json`](../.claude/settings.json) runs `bash scripts/setup-signing.sh` at the start of every agent session. The script is idempotent — it sets the repo-local signing config (`gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgsign=true`, `gpg.ssh.allowedSignersFile`) if it isn't already, then exits silently.
- A fresh clone doesn't carry repo-local git config, so the hook re-applies it the first session in that clone. If you ever see an unsigned commit or git complains about `user.signingkey`, run `bash scripts/setup-signing.sh` directly — it's safe to run any time.
- If `setup-signing.sh` finds no key, it prints a one-line hint and exits 0 — it never blocks a session or a CI install, so the only consequence of skipping setup is unsigned commits.

## How this differs from StoryCut

projitect's setup is adapted from StoryCut's. StoryCut rewrites the **author identity** to `Claude Code (<contributor>)` via per-worktree config, gated on `claude/*` branches. projitect keeps the contributor's normal authorship (you author as the contributor, with a `Co-Authored-By` trailer) and configures **signing only**, repo-local, on every branch. The goal here is the Verified badge on every commit, not a separate author identity.

## Why a dedicated key

- A separate, revocable SSH key for agent/automated commits, kept apart from your personal GPG key.
- Passwordless, so non-interactive shells (agents, CI) can sign without a passphrase prompt.

## Setup

Substitute `<your-name>` (e.g. your GitHub handle) below.

1. **Generate a passwordless ed25519 signing key:**

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/git_signing_claude -C "Claude Code (<your-name>)" -N ""
   ```

2. **Trust it locally** so `git log --show-signature` verifies your own commits:

   ```bash
   mkdir -p ~/.config/git
   echo "$(git config --global user.email) namespaces=\"git\" $(cat ~/.ssh/git_signing_claude.pub)" \
     >> ~/.config/git/allowed_signers
   ```

3. **Register the public key on GitHub** as a **Signing Key** — _not_ an Authentication key; it's
   the same form with a different **Key type** dropdown — at <https://github.com/settings/keys>.
   Use your existing verified commit email; no new email needed. This is what produces the
   Verified badge.

4. **Apply it to this repo** (also runs automatically every agent session — idempotent):

   ```bash
   bash scripts/setup-signing.sh
   ```

## Verify

```bash
git config --get commit.gpgsign    # → true
git config --get user.signingkey   # → ~/.ssh/git_signing_claude.pub
```

Your next commit will be signed; confirm the **Verified** badge on its PR.

## Notes

- projitect signs **every** commit on **every** branch (repo-local config) and keeps your normal
  authorship. Unlike StoryCut, it does **not** rewrite the author to `Claude Code (<name>)` — see
  [How this differs from StoryCut](#how-this-differs-from-storycut).
- Optional: store the signing settings in `~/.gitconfig.claude` (shared with StoryCut) and
  `setup-signing.sh` reads them from there instead of the conventional key path.
