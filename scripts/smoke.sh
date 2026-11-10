#!/usr/bin/env bash
# Comprehensive end-to-end smoke for projitect v0.1+.
#
# What it does:
#   1. Spins up a throwaway project in /tmp.
#   2. Installs the workspace packages into it (file: refs).
#   3. Exercises every CLI command end-to-end: init, remodel, inspect,
#      explain, build --force, --completions.
#   4. Validates lockfile-driven orphan removal — the headline value prop.
#   5. Validates safety nets: init refuses without git, build refuses on dirty git.
#
# Run from the monorepo root, after `pnpm build`:
#
#   pnpm build && ./scripts/smoke.sh
#
# Exits 0 if every check passes, 1 otherwise. Suitable for `gh workflow` integration once
# we wire it into CI.

set -u  # NOTE: deliberately no `-o pipefail` — inspect returns 1 on drift, which we want to detect via grep rather than have it short-circuit the pipeline.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE="$(mktemp -d -t pjt-smoke.XXXXXX)"
PKG="${ROOT}/packages"
FAILED=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILED=1; }

cleanup() { [ -n "${REG_PID:-}" ] && kill "$REG_PID" 2>/dev/null; [ -n "${REACT_REG_PID:-}" ] && kill "$REACT_REG_PID" 2>/dev/null; rm -rf "$SMOKE" "${SMOKE}-tools" "${REG:-}" "${E2E:-}" "${REACTDIR:-}" "${NEXTDIR:-}" "${REACTREG:-}"; }
trap cleanup EXIT

cd "$SMOKE"
git init -q
git config user.email t@t
git config user.name t
echo '{"name":"smoke","version":"0.0.0","private":true,"type":"module"}' > package.json

echo "Installing workspace packages into ${SMOKE}..."
npm install --no-package-lock --silent \
  "file:${PKG}/core" \
  "file:${PKG}/blueprint" \
  "file:${PKG}/cli-internals" \
  "file:${PKG}/projitect" \
  "file:${PKG}/blueprint-gitignore" \
  "file:${PKG}/blueprint-vitest" \
  "file:${PKG}/blueprint-changesets" \
  "file:${PKG}/blueprint-markdown" \
  "file:${PKG}/blueprint-skills" \
  "file:${PKG}/blueprint-husky-lint-staged" \
  "file:${PKG}/blueprint-tsconfig" \
  "effect@rc" "tsx" 2>&1 | tail -1

BIN=node_modules/@projitect/cli/bin/pjt.mjs

echo "=== 1. CLI surface ==="
$BIN --help 2>&1 | grep -q "init"    && pass "--help lists init"    || fail "--help missing init"
$BIN --help 2>&1 | grep -q "build"   && pass "--help lists build"   || fail "--help missing build"
$BIN --help 2>&1 | grep -q "add"     && pass "--help lists add"     || fail "--help missing add"
$BIN --completions bash 2>&1 | grep -q "begin-pjt-completions" && pass "--completions bash emits script" || fail "completions broken"

echo "=== 2. pjt init ==="
$BIN init > /dev/null 2>&1
[ -f .pjt.ts ]   && pass ".pjt.ts created"          || fail ".pjt.ts missing"
[ -f .pjt.lock ] && pass ".pjt.lock created"        || fail ".pjt.lock missing"
grep -q '"@projitect/cli"' package.json && pass "package.json got projitect devDep" || fail "no projitect devDep"
grep -q '"pjt"'        package.json && pass "package.json got pjt script"      || fail "no pjt script"

echo "=== 3. inspect clean after init ==="
$BIN inspect > /dev/null 2>&1
[ $? -eq 0 ] && pass "exit 0 after init" || fail "exit nonzero"

echo "=== 4. drift detection on hand-edit inside a region ==="
# Splice in two gitignore sections (bypasses npm install, which would need the registry)
cat > splice.mjs <<'EOF'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { gitignores } from "@projitect/blueprint-gitignore"',
  callLines: ["gitignores.macOs(),", "gitignores.node(),"],
}))
EOF
node --experimental-strip-types splice.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after first remodel" || fail "still dirty after remodel"

sed -i.bak 's/\.DS_Store$/.DS_Store_HAND/' .gitignore && rm .gitignore.bak
$BIN inspect > /dev/null 2>&1
[ $? -eq 1 ] && pass "drift detected on region edit (exit 1)" || fail "drift NOT detected"

$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after remodel re-applies" || fail "still dirty"

echo "=== 5. lockfile-driven removal ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('.pjt.ts', 'utf8');
s = s.replace(/^\s*gitignores\.node\(\),\n/m, '');
fs.writeFileSync('.pjt.ts', s);
"
INSPECT_OUT=$($BIN inspect 2>&1)
echo "$INSPECT_OUT" | grep -q "remove pjt:gitignore:node" && pass "inspect reports orphan removal" || fail "no orphan in inspect"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after removal applied" || fail "still dirty after removal"
grep -q "gitignore:node"  .gitignore && fail "node region still present" || pass "node region cleaned up"
grep -q "gitignore:macos" .gitignore && pass "macos region kept"          || fail "macos region missing"

echo "=== 5b. vitest blueprint adds vitest.config.ts + merges package.json ==="
# Splice the vitest blueprint into the same .pjt.ts (still using the splice helper —
# real `pjt add` would shell out to npm install, which would touch the registry).
cat > splice-vitest.mjs <<'EOF'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { vitest } from "@projitect/blueprint-vitest"',
  callLines: ["vitest(),"],
}))
EOF
node --experimental-strip-types splice-vitest.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after vitest remodel" || fail "vitest blueprint left drift"
[ -f vitest.config.ts ] && pass "vitest.config.ts created" || fail "vitest.config.ts missing"
grep -q 'provider: "v8"' vitest.config.ts && pass "vitest.config has v8 coverage" || fail "coverage missing from config"
grep -q '"vitest"' package.json && pass "vitest devDep merged into package.json" || fail "vitest devDep not merged"
grep -q '"test": "vitest run"' package.json && pass "vitest test script merged" || fail "test script missing"
grep -q "pjt:vitest" .gitignore && pass ".gitignore got coverage/ region" || fail "no coverage region"
grep -q "coverage/" .gitignore && pass ".gitignore contains coverage/" || fail "coverage/ entry missing"

echo "=== 5b3. changesets blueprint owns .changeset/config.json + merges package.json ==="
cat > splice-changesets.mjs <<'EOF'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { changesets } from "@projitect/blueprint-changesets"',
  callLines: ["changesets(),"],
}))
EOF
node --experimental-strip-types splice-changesets.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after changesets remodel" || fail "changesets blueprint left drift"
[ -f .changeset/config.json ] && pass ".changeset/config.json created" || fail ".changeset/config.json missing"
grep -q '"changeset": "changeset"' package.json && pass "changeset script merged" || fail "changeset script missing"
grep -q '"version-packages": "changeset version"' package.json && pass "version-packages script merged" || fail "version-packages script missing"
grep -q '"@changesets/cli"' package.json && pass "@changesets/cli devDep merged into package.json" || fail "@changesets/cli devDep not merged"

echo "=== 5b5. skills package: add, upgrade (separate processes), drift, remove ==="
# Two versions of a skill package, each packed into a real tarball with `npm pack`.
make_skills_pkg() {
  local version="$1" dir="$SMOKE/pkgsrc-$1"
  mkdir -p "$dir"
  cat > "$dir/package.json" <<EOF
{ "name": "acme-skills", "version": "$version", "type": "module", "main": "index.mjs" }
EOF
  local skill_md run_sh extra
  if [ "$version" = "1.0.0" ]; then
    skill_md='# v1\n'; extra='"assets/img/old.txt": "old\n"'
  else
    skill_md='# v2\n'; extra='"assets/img/new.txt": "new\n"'
  fi
  cat > "$dir/index.mjs" <<EOF
import { skills } from "@projitect/blueprint-skills"
import pkg from "./package.json" with { type: "json" }
export const acmeSkills = skills({
  id: "acme:skills",
  version: pkg.version,
  skills: [{ name: "smoke-skill", files: { "SKILL.md": "$skill_md", "scripts/run.sh": "echo run\n", "assets/keep/k.txt": "keep\n", $extra } }],
})
EOF
  (cd "$dir" && npm pack --silent --pack-destination "$SMOKE" > /dev/null 2>&1)
}
# Unpack a packed tarball into node_modules the way a package manager would (the project's
# devDependencies from earlier steps need the network, so `npm install` is not usable here).
install_skills_pkg() {
  rm -rf node_modules/acme-skills
  mkdir -p node_modules/acme-skills
  tar -xzf "$SMOKE/acme-skills-$1.tgz" -C node_modules/acme-skills --strip-components=1
}
make_skills_pkg 1.0.0
make_skills_pkg 1.1.0
[ -f "$SMOKE/acme-skills-1.0.0.tgz" ] && [ -f "$SMOKE/acme-skills-1.1.0.tgz" ] && pass "packed two skill package versions" || fail "npm pack failed"

cat > splice-skills.mjs <<'EOF'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { acmeSkills } from "acme-skills"',
  callLines: ["acmeSkills,"],
}))
EOF
cat > drop-skills.mjs <<'EOF'
import fs from "node:fs"
const lines = fs.readFileSync(".pjt.ts", "utf8").split("\n")
fs.writeFileSync(".pjt.ts", lines.filter((l) => l.trim() !== "acmeSkills,").join("\n"))
EOF
mkdir -p .claude/skills/user-skill
echo "mine" > .claude/skills/user-skill/SKILL.md
install_skills_pkg 1.0.0
node --experimental-strip-types splice-skills.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after skills remodel" || fail "skills package left drift"
[ -f .claude/skills/smoke-skill/SKILL.md ] && pass "SKILL.md installed" || fail "SKILL.md missing"
[ -f .claude/skills/smoke-skill/assets/img/old.txt ] && pass "nested skill asset installed" || fail "nested asset missing"
RUN_SUM_BEFORE=$(cksum < .claude/skills/smoke-skill/scripts/run.sh)
KEEP_SUM_BEFORE=$(cksum < .claude/skills/smoke-skill/assets/keep/k.txt)

# Upgrade: install the 1.1.0 tarball, then inspect in its own process BEFORE remodel.
install_skills_pkg 1.1.0
INSPECT_JSON=$($BIN inspect --json 2>/dev/null)
INSPECT_EXIT=$?
[ $INSPECT_EXIT -eq 1 ] && pass "inspect reports drift before upgrade remodel (exit 1)" || fail "inspect did not exit 1 before upgrade remodel"
echo "$INSPECT_JSON" | tr -d '[:space:]' | grep -q '"from":"1.0.0".*"to":"1.1.0"\|"to":"1.1.0".*"from":"1.0.0"' && pass "inspect reports upgrade 1.0.0 -> 1.1.0" || fail "inspect missed the real upgrade from/to"
echo "$INSPECT_JSON" | grep -q ".claude/skills/smoke-skill/SKILL.md" && pass "inspect lists changed SKILL.md" || fail "inspect missed SKILL.md drift"
$BIN remodel > /dev/null
grep -q "# v2" .claude/skills/smoke-skill/SKILL.md && pass "upgrade rewrote SKILL.md" || fail "SKILL.md not updated"
[ -f .claude/skills/smoke-skill/assets/img/new.txt ] && pass "upgrade added new file" || fail "new file missing"
[ ! -e .claude/skills/smoke-skill/assets/img/old.txt ] && pass "upgrade removed dropped file" || fail "dropped file survived"
[ "$RUN_SUM_BEFORE" = "$(cksum < .claude/skills/smoke-skill/scripts/run.sh)" ] && pass "unchanged script untouched" || fail "unchanged script changed"
[ "$KEEP_SUM_BEFORE" = "$(cksum < .claude/skills/smoke-skill/assets/keep/k.txt)" ] && pass "unchanged nested asset untouched" || fail "unchanged nested asset changed"
$BIN inspect > /dev/null 2>&1 && pass "clean after skills upgrade" || fail "drift after skills upgrade"

echo "tampered" > .claude/skills/smoke-skill/scripts/run.sh
$BIN inspect > /dev/null 2>&1
[ $? -eq 1 ] && pass "skill file drift detected (exit 1)" || fail "skill drift NOT detected"
$BIN remodel > /dev/null
grep -q "echo run" .claude/skills/smoke-skill/scripts/run.sh && pass "remodel restored skill file" || fail "skill file not restored"

node drop-skills.mjs
$BIN remodel > /dev/null
[ ! -e .claude/skills/smoke-skill ] && pass "removed skill and its directory" || fail "skill directory survived removal"
[ -f .claude/skills/user-skill/SKILL.md ] && pass "unrelated skill untouched" || fail "unrelated skill lost"
$BIN inspect > /dev/null 2>&1 && pass "clean after skills removal" || fail "drift after skills removal"

echo "=== 5b4. husky-lint-staged blueprint owns .husky/pre-commit + merges package.json ==="
# Preset a conflicting `prepare` script: the blueprint owns scripts.prepare and overwrites it.
cat > preset-prepare.mjs <<'EOF2'
import { readFileSync, writeFileSync } from "node:fs"
const pkg = JSON.parse(readFileSync("package.json", "utf8"))
pkg.scripts = { ...pkg.scripts, prepare: "echo old-prepare" }
writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`)
EOF2
node preset-prepare.mjs
cat > splice-husky.mjs <<'EOF2'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { huskyLintStaged } from "@projitect/blueprint-husky-lint-staged"',
  callLines: ["huskyLintStaged(),"],
}))
EOF2
node --experimental-strip-types splice-husky.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after husky-lint-staged remodel" || fail "husky-lint-staged blueprint left drift"
[ -f .husky/pre-commit ] && pass ".husky/pre-commit created" || fail ".husky/pre-commit missing"
grep -q "lint-staged" .husky/pre-commit && pass "hook runs lint-staged" || fail "hook does not run lint-staged"
grep -q "husky.sh" .husky/pre-commit && fail "hook sources husky.sh" || pass "hook has no husky.sh bootstrap"
grep -q '"prepare": "husky"' package.json && pass "existing prepare overwritten with husky" || fail "prepare not set to husky"
grep -q 'old-prepare' package.json && fail "old prepare survived" || pass "old prepare value gone"
grep -q '"lint-staged": {' package.json && pass "lint-staged field merged" || fail "lint-staged field missing"
grep -q '"husky": "' package.json && pass "husky devDep merged" || fail "husky devDep missing"
grep -q '"lint-staged": "\^' package.json && pass "lint-staged devDep merged" || fail "lint-staged devDep missing"

# Drift: editing the owned hook is reported by inspect and repaired by remodel.
echo "echo tampered" >> .husky/pre-commit
$BIN inspect > /dev/null 2>&1 && fail "inspect missed hook edit" || pass "inspect reports hook drift"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after hook repair" || fail "hook drift survived remodel"
grep -q "tampered" .husky/pre-commit && fail "hook edit survived remodel" || pass "hook content restored"

# Drift: editing an owned package.json key is reported and repaired the same way.
sed -i.bak 's/"prepare": "husky"/"prepare": "echo drifted"/' package.json
rm package.json.bak
$BIN inspect > /dev/null 2>&1 && fail "inspect missed prepare edit" || pass "inspect reports owned-key drift"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after owned-key repair" || fail "owned-key drift survived remodel"
grep -q '"prepare": "husky"' package.json && pass "prepare restored to husky" || fail "prepare not restored"

# Real commit-time behavior: install the generated devDependencies (the blueprint never installs
# them) plus prettier (the project's own formatter), then commit through the husky 9 hook.
# The hook has no executable bit; husky runs it through `sh`, so this proves that assumption.
HUSKY_RANGE=$(sed -n 's/.*"husky": "\(\^[0-9][^"]*\)".*/\1/p' package.json | head -1)
LINT_STAGED_RANGE=$(sed -n 's/.*"lint-staged": "\(\^[0-9][^"]*\)".*/\1/p' package.json | head -1)
git add -A > /dev/null 2>&1
git commit -q -m "chore: smoke baseline" > /dev/null 2>&1   # hooksPath not set yet, so no hook runs
# Install into a separate prefix: a --no-save install on top of the `file:` links above trips an
# npm arborist crash on some npm versions. husky and the hook find the tools through PATH.
TOOLS="${SMOKE}-tools"
mkdir -p "$TOOLS"
(cd "$TOOLS" && echo '{"private":true}' > package.json && npm install --no-package-lock "husky@${HUSKY_RANGE}" "lint-staged@${LINT_STAGED_RANGE}" prettier) || fail "installing husky, lint-staged and prettier failed"
ORIGINAL_PATH="$PATH"
export PATH="${TOOLS}/node_modules/.bin:${PATH}"
npm run prepare --silent || fail "npm run prepare failed"
[ "$(git config core.hooksPath)" = ".husky/_" ] && pass "husky prepare installed git hooks" || fail "husky did not set core.hooksPath"
[ -x .husky/pre-commit ] && fail "hook unexpectedly executable" || pass "hook has no executable bit"
printf '{ "broken": ' > bad.json
git add bad.json
git commit -q -m "chore: should be blocked" > /dev/null 2>&1 && fail "commit with broken json was not blocked" || pass "husky + lint-staged block a failing staged file"
git rev-parse -q --verify HEAD~1 > /dev/null 2>&1 && fail "blocked commit landed" || pass "blocked commit left no new commit"
printf '{ "broken": false }\n' > bad.json
git add bad.json
git commit -q -m "chore: now valid" > /dev/null 2>&1 && pass "commit succeeds once the staged file is fixed" || fail "commit with fixed file was blocked"
git config --unset core.hooksPath   # keep the hook out of later sections
export PATH="$ORIGINAL_PATH"

echo "=== 5b2. markdownSection writes a fenced region into README.md ==="
# Define a one-off markdownSection blueprint inline in .pjt.ts (avoids cross-file resolution).
# The splice adds an import + a call line; the inline `const readmeIntro = ...` goes between
# the `pjt:imports` markers so the file still parses.
cat > splice-md.mjs <<'EOF'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { markdownSection } from "@projitect/blueprint"',
  callLines: ["markdownSection({ id: \"smoke:readme:intro\", version: \"1.0.0\", path: \"README.md\", content: \"Hello from the smoke test.\\n\" }),"],
}))
EOF

# Seed an existing README.md so the blueprint splices into it (rather than creating one).
cat > README.md <<'EOF'
# My project

Some prose written by the user. Lives outside the fence.
EOF

node --experimental-strip-types splice-md.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
grep -q "<!-- smoke:readme:intro start -->" README.md && pass "markdown start marker spliced" || fail "no markdown start marker"
grep -q "<!-- smoke:readme:intro end -->"   README.md && pass "markdown end marker spliced"   || fail "no markdown end marker"
grep -q "Hello from the smoke test"         README.md && pass "markdown body present"        || fail "markdown body missing"
grep -q "Some prose written by the user"    README.md && pass "user content outside fence preserved" || fail "user content lost"
$BIN inspect > /dev/null 2>&1 && pass "clean after markdown remodel" || fail "markdown drift detected"

# Drift inside the markdown region → inspect fails.
sed -i.bak 's/Hello from the smoke test/HAND EDITED/' README.md && rm README.md.bak
$BIN inspect > /dev/null 2>&1
[ $? -eq 1 ] && pass "markdown region drift detected" || fail "markdown drift NOT detected"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after markdown re-remodel" || fail "markdown still dirty"

echo "=== 5b4. markdown snippets share AGENTS.md / README.md and survive the full lifecycle ==="
cat > AGENTS.md <<'EOF'
# Agent guide

Hand-written intro.
EOF
cat > splice-snippets.mjs <<'EOF'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { markdownSnippets } from "@projitect/blueprint-markdown"',
  callLines: [
    "markdownSnippets.agentsVerification(),",
    "markdownSnippets.agentsCommits(),",
    "markdownSnippets.readmeLicense(),",
  ],
}))
EOF
node --experimental-strip-types splice-snippets.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after snippets remodel" || fail "snippets left drift"
grep -q "<!-- pjt:markdown:agents:verification start -->" AGENTS.md && pass "verification region in AGENTS.md" || fail "verification region missing"
grep -q "<!-- pjt:markdown:agents:commits start -->"      AGENTS.md && pass "commits region in AGENTS.md"      || fail "commits region missing"
grep -q "<!-- pjt:markdown:readme:license start -->"      README.md && pass "license region in README.md"      || fail "license region missing"
grep -q "Hand-written intro."                             AGENTS.md && pass "AGENTS.md user text preserved"    || fail "AGENTS.md user text lost"
grep -q "Some prose written by the user"                  README.md && pass "README.md user text preserved"    || fail "README.md user text lost"

cp AGENTS.md AGENTS.before && cp README.md README.before && cp .pjt.lock lock.before
$BIN remodel > /dev/null
cmp -s AGENTS.md AGENTS.before && cmp -s README.md README.before && cmp -s .pjt.lock lock.before && pass "second remodel changes no bytes" || fail "second remodel changed files"
rm AGENTS.before README.before lock.before

sed -i.bak 's/Write conventional commit subjects/Write sloppy commit subjects/' AGENTS.md && rm AGENTS.md.bak
DRIFT_OUT=$($BIN inspect 2>&1) && fail "snippet hand-edit NOT detected" || pass "snippet hand-edit detected (nonzero exit)"
echo "$DRIFT_OUT" | grep -q "AGENTS.md" && pass "inspect names AGENTS.md" || fail "inspect did not name AGENTS.md"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after snippet restore" || fail "snippet still dirty"
grep -q "Write conventional commit subjects" AGENTS.md && pass "snippet region restored" || fail "snippet region not restored"

sed -i.bak '/markdownSnippets\.agentsCommits(),/d' .pjt.ts && rm .pjt.ts.bak
$BIN inspect 2>&1 | grep -q "remove pjt:markdown:agents:commits" && pass "inspect reports snippet removal" || fail "no snippet removal in inspect"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after snippet removal" || fail "dirty after snippet removal"
grep -q "markdown:agents:commits" AGENTS.md && fail "commits region still present" || pass "commits region removed"
grep -q "markdown:agents:verification" AGENTS.md && pass "verification region kept" || fail "verification region lost"
grep -q "Hand-written intro." AGENTS.md && pass "AGENTS.md user text survives removal" || fail "user text lost on removal"

echo "=== 5c. tsconfig blueprint writes tsconfig.json with strict defaults ==="
cat > splice-tsconfig.mjs <<'EOF'
import { Effect } from "effect"
import { splice } from "@projitect/cli-internals"
await Effect.runPromise(splice({
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  importLine: 'import { tsconfig } from "@projitect/blueprint-tsconfig"',
  callLines: ["tsconfig(),"],
}))
EOF
node --experimental-strip-types splice-tsconfig.mjs > /dev/null 2>&1
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after tsconfig remodel" || fail "tsconfig drift after remodel"
[ -f tsconfig.json ] && pass "tsconfig.json created" || fail "tsconfig.json missing"
grep -q '"strict": true'                       tsconfig.json && pass "strict default = true"          || fail "strict missing"
grep -q '"noUncheckedIndexedAccess": true'     tsconfig.json && pass "noUncheckedIndexedAccess on"   || fail "noUncheckedIndexedAccess missing"
grep -q '"exactOptionalPropertyTypes": true'   tsconfig.json && pass "exactOptionalPropertyTypes on" || fail "EOPT missing"
grep -q '"module": "NodeNext"'                 tsconfig.json && pass "module = NodeNext"             || fail "module wrong"
grep -q '"rootDir": "./src"'                   tsconfig.json && pass "rootDir = ./src"               || fail "rootDir wrong"

# Drift on the owned file should be caught (owned mode = whole-file content match).
sed -i.bak 's/"strict": true/"strict": false/' tsconfig.json && rm tsconfig.json.bak
$BIN inspect > /dev/null 2>&1
[ $? -eq 1 ] && pass "owned drift detected (exit 1)" || fail "owned drift NOT detected"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after owned remodel re-applies" || fail "owned still dirty"

echo "=== 5d. public CLI + real package upgrade: add -> remodel -> upgrade -> inspect -> remodel -> swap -> remove ==="
# Two locally packed versions of @projitect/blueprint-markdown are served by a throwaway npm
# registry. The project is a separate clean directory and every CLI call is its own process, so
# the version `pjt inspect` sees after the upgrade comes from the installed package, not from an
# in-memory override.
REG="$(mktemp -d -t pjt-registry.XXXXXX)"
E2E="$(mktemp -d -t pjt-upgrade.XXXXXX)"
pack_markdown() { # <version> <old> <new>: pack dist + manifest as <version>; optionally rewrite one phrase
  local dir="$REG/pkg-$1"
  mkdir -p "$dir/package"
  cp -r "${PKG}/blueprint-markdown/dist" "${PKG}/blueprint-markdown/package.json" "$dir/package/"
  node -e "
const fs = require('fs');
for (const f of ['package.json', 'dist/package.json']) {
  const p = process.argv[1] + '/' + f;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = process.argv[2];
  for (const k of ['peerDependencies', 'devDependencies', 'scripts']) delete j[k];
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
" "$dir/package" "$1"
  [ -n "${2:-}" ] && sed -i.bak "s/$2/$3/" "$dir/package/dist/src/index.js" && rm "$dir/package/dist/src/index.js.bak"
  npm pack "$dir/package" --pack-destination "$REG" --silent > /dev/null 2>&1
}
pack_markdown 1.0.0
pack_markdown 1.1.0 "Write conventional commit subjects" "Write Conventional Commits subjects"
TGZ1="$REG/projitect-blueprint-markdown-1.0.0.tgz"
TGZ2="$REG/projitect-blueprint-markdown-1.1.0.tgz"

# Two more packages served by the same registry under the @acme scope: a skills blueprint (1.0.0 and
# 1.1.0) and a package without "projitect" metadata. Both are packed with `npm pack`.
make_acme_skills() { # <version>
  local dir="$REG/skills-$1"
  mkdir -p "$dir"
  local skill_md='# v1\n' extra='"assets/img/old.txt": "old\n"'
  [ "$1" = "1.1.0" ] && { skill_md='# v2\n'; extra='"assets/img/new.txt": "new\n"'; }
  cat > "$dir/package.json" <<EOF
{ "name": "@acme/skills", "version": "$1", "type": "module", "main": "index.mjs",
  "projitect": { "type": "blueprint", "import": "import { acmeSkills } from \"@acme/skills\"", "call": "acmeSkills" } }
EOF
  cat > "$dir/index.mjs" <<EOF
import { skills } from "@projitect/blueprint-skills"
import pkg from "./package.json" with { type: "json" }
export const acmeSkills = skills({
  id: "acme:skills",
  version: pkg.version,
  skills: [{ name: "acme-skill", files: { "SKILL.md": "$skill_md", "scripts/run.sh": "echo run\n", $extra } }],
})
EOF
  npm pack "$dir" --pack-destination "$REG" --silent > /dev/null 2>&1
}
make_acme_skills 1.0.0
make_acme_skills 1.1.0
mkdir -p "$REG/plain"
echo '{"name":"@acme/plain","version":"1.0.0"}' > "$REG/plain/package.json"
npm pack "$REG/plain" --pack-destination "$REG" --silent > /dev/null 2>&1
SK1="$REG/acme-skills-1.0.0.tgz"
SK2="$REG/acme-skills-1.1.0.tgz"
PLAIN="$REG/acme-plain-1.0.0.tgz"
publish() { # <markdown latest> [<skills latest>]: rewrite the registry state; a version is only listed once published
  local md="\"1.0.0\":\"$TGZ1\"" sk="\"1.0.0\":\"$SK1\""
  [ "$1" = "1.1.0" ] && md="$md,\"1.1.0\":\"$TGZ2\""
  [ "${2:-1.0.0}" = "1.1.0" ] && sk="$sk,\"1.1.0\":\"$SK2\""
  printf '{"packages":[{"name":"@projitect/blueprint-markdown","latest":"%s","tarballs":{%s}},{"name":"@acme/skills","latest":"%s","tarballs":{%s}},{"name":"@acme/plain","latest":"1.0.0","tarballs":{"1.0.0":"%s"}}]}' "$1" "$md" "${2:-1.0.0}" "$sk" "$PLAIN" > "$REG/state.json"
}
publish 1.0.0
node "${ROOT}/scripts/local-registry.mjs" "$REG/state.json" "$REG/port" &
REG_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do [ -s "$REG/port" ] && break; sleep 0.25; done
[ -s "$REG/port" ] && pass "local registry listening" || fail "local registry did not start"

cd "$E2E"
git init -q
git config user.email t@t
git config user.name t
echo '{"name":"upgrade-smoke","version":"0.0.0","private":true,"type":"module"}' > package.json
npm install --no-package-lock --silent \
  "file:${PKG}/core" \
  "file:${PKG}/blueprint" \
  "file:${PKG}/cli-internals" \
  "file:${PKG}/projitect" \
  "file:${PKG}/blueprint-skills" \
  "effect@rc" "tsx" 2>&1 | tail -1
printf '@projitect:registry=http://127.0.0.1:%s/\n@acme:registry=http://127.0.0.1:%s/\n' "$(cat "$REG/port")" "$(cat "$REG/port")" > .npmrc
$BIN init > /dev/null 2>&1

printf '# Agent guide\n\nHand-written intro.\n' > AGENTS.md
printf '# My project\n\nHand-written readme.\n' > README.md
cp AGENTS.md AGENTS.seed && cp README.md README.seed
unmanaged() { awk '/^<!-- pjt:markdown:.* start -->$/{skip=1} !skip{print} /^<!-- pjt:markdown:.* end -->$/{skip=0}' "$1"; }

# Install through the public CLI: `pjt add` shells out the package manager, reads the installed
# package's "projitect" metadata and splices the chosen sections into .pjt.ts.
$BIN add @projitect/blueprint-markdown --section agentsVerification,agentsCommits,readmeLicense > /dev/null 2>&1
grep -q '"version": "1.0.0"' node_modules/@projitect/blueprint-markdown/package.json && pass "pjt add installed 1.0.0 from the registry" || fail "pjt add did not install 1.0.0"
grep -q "markdownSnippets.agentsCommits()" .pjt.ts && pass "pjt add spliced the chosen sections into .pjt.ts" || fail "pjt add did not splice .pjt.ts"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after remodel of the installed package" || fail "drift after first remodel"
grep -q '"version": "1.0.0"' .pjt.lock && pass ".pjt.lock records 1.0.0" || fail ".pjt.lock missing 1.0.0"
grep -q "Write conventional commit subjects" AGENTS.md && pass "AGENTS.md carries the 1.0.0 content" || fail "1.0.0 content missing"
unmanaged AGENTS.md | cmp -s - AGENTS.seed && unmanaged README.md | cmp -s - README.seed && pass "text outside the regions is byte-identical after add" || fail "unmanaged text changed after add"
cp AGENTS.md AGENTS.v1 && cp README.md README.v1 && cp .pjt.lock lock.v1
$BIN remodel > /dev/null
cmp -s AGENTS.md AGENTS.v1 && cmp -s README.md README.v1 && cmp -s .pjt.lock lock.v1 && pass "second remodel changes no bytes" || fail "second remodel changed files"

# `init` also records `projitect` from the public registry; drop it so reinstalls keep the local build.
npm pkg delete devDependencies.@projitect/cli > /dev/null 2>&1

# Publish 1.1.0 and upgrade with the package manager. Nothing has been remodelled yet.
publish 1.1.0
npm install -D --no-package-lock --silent @projitect/blueprint-markdown@1.1.0 > /dev/null 2>&1
grep -q '"version": "1.1.0"' node_modules/@projitect/blueprint-markdown/package.json && pass "package manager upgraded to 1.1.0" || fail "upgrade to 1.1.0 failed"
UP_OUT=$($BIN inspect 2>&1)
UP_EXIT=$?
[ "$UP_EXIT" -eq 1 ] && pass "inspect after the upgrade, before remodel, exits 1" || fail "inspect exit was $UP_EXIT after upgrade"
echo "$UP_OUT" | grep -q "upgrade pjt:markdown:agents:commits 1.0.0 → 1.1.0" && pass "inspect reports the real 1.0.0 → 1.1.0 upgrade" || fail "inspect missed the upgrade"
echo "$UP_OUT" | grep -q "modify AGENTS.md" && pass "inspect names AGENTS.md as changed" || fail "inspect did not name AGENTS.md"
echo "$UP_OUT" | grep -q 'Run `pjt remodel`' && pass "inspect names the next command" || fail "inspect did not name pjt remodel"
cmp -s AGENTS.md AGENTS.v1 && pass "inspect wrote nothing" || fail "inspect modified AGENTS.md"
$BIN remodel > /dev/null
grep -q "Write Conventional Commits subjects" AGENTS.md && pass "remodel applied the 1.1.0 content" || fail "1.1.0 content missing"
grep -q "Write conventional commit subjects" AGENTS.md && fail "1.0.0 content still present" || pass "1.0.0 content replaced"
cmp -s README.md README.v1 && pass "README.md untouched by the upgrade" || fail "README.md changed by the upgrade"
grep -q '"version": "1.1.0"' .pjt.lock && pass ".pjt.lock records 1.1.0" || fail ".pjt.lock still at 1.0.0"
unmanaged AGENTS.md | cmp -s - AGENTS.seed && pass "text outside the regions is byte-identical after upgrade" || fail "unmanaged text changed after upgrade"
$BIN inspect > /dev/null 2>&1 && pass "clean after remodel of the upgrade" || fail "drift after upgrade remodel"

# Swap one snippet for another, then remove one.
sed -i.bak 's/markdownSnippets\.agentsCommits()/markdownSnippets.agentsNoDestructiveShortcuts()/' .pjt.ts && rm .pjt.ts.bak
$BIN remodel > /dev/null
grep -q "markdown:agents:commits" AGENTS.md && fail "swapped-out region still present" || pass "swapped-out region removed"
grep -q "markdown:agents:no-destructive-shortcuts start" AGENTS.md && pass "swapped-in region present" || fail "swapped-in region missing"
unmanaged AGENTS.md | cmp -s - AGENTS.seed && pass "text outside the regions is byte-identical after swap" || fail "unmanaged text changed after swap"
$BIN inspect > /dev/null 2>&1 && pass "clean after swap" || fail "drift after swap"
sed -i.bak '/markdownSnippets\.readmeLicense()/d' .pjt.ts && rm .pjt.ts.bak
$BIN remodel > /dev/null
cmp -s README.md README.seed && pass "README.md is byte-identical to the seed after removal" || fail "README.md differs from the seed after removal"
$BIN inspect > /dev/null 2>&1 && pass "clean after removal" || fail "drift after removal"

# Hand-edited managed content: `inspect --json` prints parseable JSON naming the drifted file and
# exits 1; remodel repairs it and inspect exits 0 again.
sed -i.bak 's/^\(<!-- pjt:markdown:agents:no-destructive-shortcuts start -->\)$/\1\nHAND EDIT/' AGENTS.md && rm AGENTS.md.bak
DRIFT_JSON=$($BIN inspect --json 2>/dev/null)
DRIFT_EXIT=$?
[ "$DRIFT_EXIT" -eq 1 ] && pass "inspect --json exits 1 on a hand-edited managed file" || fail "inspect --json exit was $DRIFT_EXIT on drift"
echo "$DRIFT_JSON" | python3 -c "import sys, json; d = json.loads(sys.stdin.read()); assert d['hasDrift'] is True; assert any(f['path'] == 'AGENTS.md' and f['status'] != 'ok' for f in d['files'])" > /dev/null 2>&1 && pass "inspect --json is parseable and names the drifted AGENTS.md" || fail "inspect --json did not name AGENTS.md as drifted"
$BIN inspect 2>&1 | grep -q 'Run `pjt remodel`' && pass "inspect drift report names the next command" || fail "inspect drift report does not name pjt remodel"
$BIN remodel > /dev/null
CLEAN_JSON=$($BIN inspect --json 2>/dev/null)
CLEAN_EXIT=$?
[ "$CLEAN_EXIT" -eq 0 ] && echo "$CLEAN_JSON" | python3 -c "import sys, json; assert json.loads(sys.stdin.read())['hasDrift'] is False" > /dev/null 2>&1 && pass "inspect --json exits 0 with hasDrift false once repaired" || fail "inspect --json not clean after remodel"

# Agent path, no terminal: `add` with stdin from /dev/null and no --section installs every section;
# naming all sections explicitly gives the same bytes; both give the same bytes on every run.
reset_markdown() {
  sed -i.bak '/markdownSnippets\./d' .pjt.ts && rm .pjt.ts.bak
  $BIN remodel > /dev/null
}
reset_markdown
$BIN add @projitect/blueprint-markdown < /dev/null > /dev/null 2>&1
[ "$(grep -c 'markdownSnippets\.' .pjt.ts)" -eq 6 ] && pass "non-interactive add without --section installs all six sections" || fail "non-interactive add did not install every section"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after the non-interactive add" || fail "drift after the non-interactive add"
cp AGENTS.md AGENTS.all && cp README.md README.all && cp .pjt.lock lock.all && cp .pjt.ts pjt.all
reset_markdown
$BIN add @projitect/blueprint-markdown --section agentsPackageManager,agentsVerification,agentsCommits,agentsNoDestructiveShortcuts,readmeContributing,readmeLicense < /dev/null > /dev/null 2>&1
$BIN remodel > /dev/null
cmp -s AGENTS.md AGENTS.all && cmp -s README.md README.all && cmp -s .pjt.lock lock.all && cmp -s .pjt.ts pjt.all && pass "explicit --section run gives the same bytes as the all-sections run" || fail "explicit and implicit installs differ"

# Skills blueprint through the registry: add, upgrade, drift, remove.
$BIN add @acme/skills < /dev/null > /dev/null 2>&1
grep -q "acmeSkills," .pjt.ts && pass "pjt add spliced the skills blueprint into .pjt.ts" || fail "skills blueprint not spliced"
$BIN remodel > /dev/null
$BIN inspect > /dev/null 2>&1 && pass "clean after installing the skills package" || fail "drift after installing the skills package"
grep -q "# v1" .claude/skills/acme-skill/SKILL.md && pass "skill 1.0.0 content installed" || fail "skill content missing"
publish 1.1.0 1.1.0
# `remodel` records `projitect` again; drop it so the reinstall keeps the local build.
npm pkg delete devDependencies.@projitect/cli > /dev/null 2>&1
npm install -D --no-package-lock --silent @acme/skills@1.1.0 > /dev/null 2>&1
SK_JSON=$($BIN inspect --json 2>/dev/null)
[ $? -eq 1 ] && echo "$SK_JSON" | grep -q ".claude/skills/acme-skill/SKILL.md" && pass "inspect reports the skills upgrade as drift" || fail "inspect missed the skills upgrade"
$BIN remodel > /dev/null
grep -q "# v2" .claude/skills/acme-skill/SKILL.md && [ -f .claude/skills/acme-skill/assets/img/new.txt ] && [ ! -e .claude/skills/acme-skill/assets/img/old.txt ] && pass "remodel applied the skills upgrade" || fail "skills upgrade not applied"
$BIN inspect > /dev/null 2>&1 && pass "clean after the skills upgrade" || fail "drift after the skills upgrade"
sed -i.bak '/acmeSkills,/d' .pjt.ts && rm .pjt.ts.bak
$BIN remodel > /dev/null
[ ! -e .claude/skills/acme-skill ] && pass "removing the skills blueprint removes its files" || fail "skill directory survived removal"
$BIN inspect > /dev/null 2>&1 && pass "clean after the skills removal" || fail "drift after the skills removal"

# A package without "projitect" metadata fails with an id and the next command.
NOMETA_OUT=$($BIN add @acme/plain < /dev/null 2>&1)
NOMETA_EXIT=$?
[ "$NOMETA_EXIT" -ne 0 ] && pass "add of a package without metadata exits nonzero" || fail "add without metadata exited 0"
echo "$NOMETA_OUT" | grep -q "pjt.add.metadata-missing" && echo "$NOMETA_OUT" | grep -q 'pjt remodel' && pass "metadata error names its id and the next command" || fail "metadata error lacks id or next command"


echo "=== 5e. first-party blueprints report their installed version: two-version packed install ==="
# The five manifest-versioned blueprints are packed as 1.0.0 and 1.1.0 (dist plus a rewritten
# package.json and dist/package.json) and served by the same throwaway registry. Every step runs
# in its own CLI process, so the versions `pjt inspect` compares come from the installed packages.
FP_PKGS="gitignore tsconfig vitest changesets husky-lint-staged"
pack_first_party() { # <package suffix> <version>
  local dir="$REG/fp-$1-$2"
  mkdir -p "$dir/package"
  cp -r "${PKG}/blueprint-$1/dist" "${PKG}/blueprint-$1/package.json" "$dir/package/"
  node -e "
const fs = require('fs');
for (const f of ['package.json', 'dist/package.json']) {
  const p = process.argv[1] + '/' + f;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = process.argv[2];
  for (const k of ['peerDependencies', 'devDependencies', 'scripts']) delete j[k];
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
" "$dir/package" "$2"
  # 1.1.0 also changes the emitted content, so `inspect` has real drift to attach the upgrade to.
  if [ "$2" = "1.1.0" ]; then
    local file="$dir/package/dist/src/index.js" expr
    case "$1" in
      gitignore) file="$dir/package/dist/src/templates.js"; expr='s#^node_modules/$#node_modules/\n.smoke-cache/#' ;;
      tsconfig) expr='s#noUncheckedIndexedAccess: true,#noUncheckedIndexedAccess: true, noImplicitOverride: true,#' ;;
      vitest) expr='s#content: "coverage/\\n"#content: "coverage/\\ntmp-smoke/\\n"#' ;;
      changesets) expr='s#options.baseBranch ?? "main"#options.baseBranch ?? "trunk"#' ;;
      husky-lint-staged) expr='s#content: "lint-staged\\n"#content: "pnpm lint-staged\\n"#' ;;
    esac
    sed -i.bak "$expr" "$file" && rm "$file.bak"
  fi
  npm pack "$dir/package" --pack-destination "$REG" --silent > /dev/null 2>&1
}
fp_state() { # <latest version>: list 1.0.0, plus 1.1.0 once it is the latest
  local entries="" sep="" tarballs
  for s in $FP_PKGS; do
    tarballs="\"1.0.0\":\"$REG/projitect-blueprint-$s-1.0.0.tgz\""
    [ "$1" = "1.1.0" ] && tarballs="$tarballs,\"1.1.0\":\"$REG/projitect-blueprint-$s-1.1.0.tgz\""
    entries="$entries$sep{\"name\":\"@projitect/blueprint-$s\",\"latest\":\"$1\",\"tarballs\":{$tarballs}}"
    sep=","
  done
  printf '{"packages":[%s]}' "$entries" > "$REG/state.json"
}
for s in $FP_PKGS; do
  pack_first_party "$s" 1.0.0
  pack_first_party "$s" 1.1.0
done
fp_state 1.0.0

FP="$(mktemp -d -t pjt-first-party.XXXXXX)"
cd "$FP"
git init -q
git config user.email t@t
git config user.name t
echo '{"name":"first-party-smoke","version":"0.0.0","private":true,"type":"module"}' > package.json
npm install --no-package-lock --silent \
  "file:${PKG}/core" \
  "file:${PKG}/blueprint" \
  "file:${PKG}/cli-internals" \
  "file:${PKG}/projitect" \
  "effect@rc" "tsx" 2>&1 | tail -1
printf '@projitect:registry=http://127.0.0.1:%s/\n' "$(cat "$REG/port")" > .npmrc
$BIN init > /dev/null 2>&1
$BIN add @projitect/blueprint-gitignore --section node < /dev/null > /dev/null 2>&1
for s in tsconfig vitest changesets husky-lint-staged; do
  $BIN add "@projitect/blueprint-$s" < /dev/null > /dev/null 2>&1
done
npm pkg delete devDependencies.@projitect/cli > /dev/null 2>&1
for s in $FP_PKGS; do
  grep -q '"version": "1.0.0"' "node_modules/@projitect/blueprint-$s/package.json" && pass "$s: pjt add installed 1.0.0" || fail "$s: 1.0.0 not installed"
done
$BIN remodel > /dev/null 2>&1
$BIN inspect > /dev/null 2>&1 && pass "clean after remodel of the five 1.0.0 blueprints" || fail "drift after the first-party remodel"
for id in pjt:gitignore:node pjt:tsconfig pjt:vitest pjt:changesets pjt:husky-lint-staged; do
  grep -A2 "\"$id\"" .pjt.lock | grep -q '"version": "1.0.0"' && pass "$id: .pjt.lock records 1.0.0" || fail "$id: .pjt.lock lacks 1.0.0"
done

# Each factory's emitted version equals its installed manifest version.
cat > fp-versions.mjs <<'JS'
import { readFileSync } from "node:fs"
const factories = {
  "@projitect/blueprint-gitignore": async (m) => Object.values(m.gitignores).map((section) => section()),
  "@projitect/blueprint-tsconfig": async (m) => [m.tsconfig()],
  "@projitect/blueprint-vitest": async (m) => [m.vitest()],
  "@projitect/blueprint-changesets": async (m) => [m.changesets()],
  "@projitect/blueprint-husky-lint-staged": async (m) => [m.huskyLintStaged()],
}
let bad = 0
for (const [name, build] of Object.entries(factories)) {
  const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version
  for (const blueprint of await build(await import(name))) {
    if (blueprint.version !== installed) {
      console.error(`${blueprint.id}: emitted ${blueprint.version}, installed ${installed}`)
      bad += 1
    }
  }
}
process.exit(bad === 0 ? 0 : 1)
JS
node fp-versions.mjs && pass "every first-party factory emits its installed manifest version (1.0.0)" || fail "a first-party factory emits a version other than its manifest"

# Publish 1.1.0 and upgrade with the package manager. Nothing has been remodelled yet.
fp_state 1.1.0
# Drop the registry-less devDependencies the blueprints merged into package.json so npm can resolve the tree.
npm pkg delete devDependencies.@projitect/cli devDependencies.effect devDependencies.vitest "devDependencies.@vitest/coverage-v8" "devDependencies.@changesets/cli" devDependencies.husky devDependencies.lint-staged > /dev/null 2>&1
npm install -D --no-package-lock --ignore-scripts --silent \
  @projitect/blueprint-gitignore@1.1.0 @projitect/blueprint-tsconfig@1.1.0 @projitect/blueprint-vitest@1.1.0 \
  @projitect/blueprint-changesets@1.1.0 @projitect/blueprint-husky-lint-staged@1.1.0 > /dev/null 2>&1
node fp-versions.mjs && pass "every first-party factory emits its installed manifest version (1.1.0)" || fail "a factory version lags its upgraded manifest"
FP_OUT=$($BIN inspect 2>&1)
FP_EXIT=$?
[ "$FP_EXIT" -eq 1 ] && pass "inspect after the upgrade, before remodel, exits 1" || fail "inspect exit was $FP_EXIT after the first-party upgrade"
for id in pjt:gitignore:node pjt:tsconfig pjt:vitest pjt:changesets pjt:husky-lint-staged; do
  echo "$FP_OUT" | grep -q "upgrade $id 1.0.0 → 1.1.0" && pass "inspect reports $id 1.0.0 → 1.1.0" || fail "inspect missed the $id upgrade"
done
$BIN remodel > /dev/null 2>&1
for id in pjt:gitignore:node pjt:tsconfig pjt:vitest pjt:changesets pjt:husky-lint-staged; do
  grep -A2 "\"$id\"" .pjt.lock | grep -q '"version": "1.1.0"' && pass "$id: .pjt.lock records 1.1.0" || fail "$id: .pjt.lock still at 1.0.0"
done
$BIN inspect > /dev/null 2>&1 && pass "clean after remodel of the first-party upgrade" || fail "drift after the first-party upgrade remodel"
kill "$REG_PID" 2>/dev/null
cd "$SMOKE"
rm -rf "$REG" "$E2E" "$FP"

echo "=== 6. explain ==="
OUT=$($BIN explain pjt.lock.parse-failed 2>&1)
echo "$OUT" | grep -q "pjt.lock.parse-failed" && pass "explain renders" || fail "explain broken"
echo "$OUT" | grep -q "projitect.dev/errors" && pass "explain links docs url" || fail "no docs url"

echo "=== 6b. inspect --json emits structured output ==="
JSON_OUT=$($BIN inspect --json 2>&1)
echo "$JSON_OUT" | grep -q '"\$schema"'  && pass "--json includes \$schema"  || fail "no \$schema in JSON"
echo "$JSON_OUT" | grep -q '"hasDrift"' && pass "--json includes hasDrift" || fail "no hasDrift in JSON"
echo "$JSON_OUT" | grep -q '"files"'    && pass "--json includes files"    || fail "no files in JSON"
echo "$JSON_OUT" | grep -q '"removals"' && pass "--json includes removals" || fail "no removals in JSON"
echo "$JSON_OUT" | grep -q '"upgrades"' && pass "--json includes upgrades" || fail "no upgrades in JSON"
echo "$JSON_OUT" | python3 -c "import sys, json; json.loads(sys.stdin.read())" > /dev/null 2>&1 && pass "--json output is valid JSON" || fail "--json output is malformed"

echo "=== 7. init refuses without git ==="
NOGIT="$(mktemp -d -t pjt-nogit.XXXXXX)"
cp -RP "${SMOKE}/node_modules" "${NOGIT}/"
cd "$NOGIT"
echo '{"name":"x","version":"0","private":true}' > package.json
node node_modules/@projitect/cli/bin/pjt.mjs init 2>&1 | grep -q "pjt.init.git-missing" && pass "init refuses without git" || fail "no git error"
cd "$SMOKE"
rm -rf "$NOGIT"

echo "=== 7b. init --yes auto-bootstraps missing git + package.json ==="
YESDIR="$(mktemp -d -t pjt-yes.XXXXXX)"
cp -RP "${SMOKE}/node_modules" "${YESDIR}/"
cd "$YESDIR"
# Neither .git nor package.json present.
[ ! -d .git ] && [ ! -f package.json ] && pass "yes-test starts clean" || fail "yes-test dirty start"
node node_modules/@projitect/cli/bin/pjt.mjs init --yes > /tmp/init-yes.out 2>&1
INIT_YES_EXIT=$?
[ $INIT_YES_EXIT -eq 0 ] && pass "init --yes exits 0 (bootstrap succeeded)" || fail "init --yes exited $INIT_YES_EXIT"
[ -d .git ]            && pass "init --yes ran git init"          || fail "no .git after --yes"
[ -f package.json ]    && pass "init --yes wrote package.json"    || fail "no package.json after --yes"
[ -f .pjt.ts ]         && pass "init --yes seeded .pjt.ts"        || fail "no .pjt.ts after --yes"
grep -q "Initialized git repo" /tmp/init-yes.out && pass "init --yes announces git bootstrap" || fail "no git announce"
grep -q "Created package.json" /tmp/init-yes.out && pass "init --yes announces package.json bootstrap" || fail "no pkg announce"
cd "$SMOKE"
rm -rf "$YESDIR"

echo "=== 8. build --force refuses on dirty git ==="
git add -A && git commit -q -m "checkpoint"
echo "stray" > scratch.txt
DIRTY_OUT=$($BIN build --force 2>&1)
echo "$DIRTY_OUT" | grep -q "dirty-git" && pass "build refuses on dirty git" || fail "dirty-git not caught"
echo "$DIRTY_OUT" | grep -q "git commit" && pass "dirty-git message names the commit step" || fail "dirty-git message lacks the next command"

echo "=== 9. build --force --force-dirty --yes wipes + rebuilds ==="
mkdir -p src docs
echo s > src/foo.txt
echo s > docs/bar.md
$BIN build --force --force-dirty --yes 2>&1 | grep -q "Wiped" && pass "build wiped + rebuilt" || fail "build flow broken"
[ -f .gitignore ] && pass ".gitignore rebuilt"      || fail "gitignore missing post-build"
[ -d src ]        && fail "src not wiped"           || pass "src wiped"
[ -d docs ]       && fail "docs not wiped"          || pass "docs wiped"
[ -f package.json ] && pass "package.json preserved"|| fail "package.json wiped"

echo "=== 9b. post-apply commands run after the files; a denied command fails ==="
# A throwaway blueprint written with the SDK's `exec` helper plus an ownFile for the file operation.
# The fix is a quoted `node -e` so no script file has to survive the wipe. The denied case spreads the
# real helper's blueprint and drops its exec permissions, so the planned op is still the helper's.
EXECDIR="$(mktemp -d -t pjt-exec.XXXXXX)"
cp -RP "${SMOKE}/node_modules" "${EXECDIR}/"
cd "$EXECDIR"
git init -q
git config user.email t@t
git config user.name t
echo '{"name":"smoke-exec","version":"0.0.0","private":true,"type":"module"}' > package.json
write_exec_blueprint() {
  cat > .pjt.ts <<EOT
import { exec, ownFile } from "@projitect/blueprint"
import { pjt } from "@projitect/cli"

const fix = "node -e \"require('node:fs').writeFileSync('marker.txt', 'ran')\""
const check = "node -e \"process.exit(require('node:fs').existsSync('marker.txt') ? 0 : 1)\""
const formatter = exec({ id: "smoke:post-apply", version: "1.0.0", check, fix })

export default pjt({
  blueprints: [
    ownFile({ id: "smoke:owned", version: "1.0.0", path: "owned.txt", content: "owned\n" }),
    $1,
  ],
})
EOT
}

write_exec_blueprint 'formatter'
node node_modules/@projitect/cli/bin/pjt.mjs build --force --force-dirty --yes > /tmp/exec-ok.out 2>&1
EXEC_OK=$?
[ $EXEC_OK -eq 0 ] && pass "build with a permitted post-apply command exits 0" || fail "permitted build exited $EXEC_OK"
[ -f owned.txt ]  && pass "file operation applied"                 || fail "owned.txt missing"
[ -f marker.txt ] && pass "build ran the post-apply command"       || fail "marker.txt missing"
grep -q "Ran 1 command" /tmp/exec-ok.out && pass "build reports the command it ran" || fail "no Ran line"
node node_modules/@projitect/cli/bin/pjt.mjs inspect > /tmp/exec-inspect.out 2>&1
[ $? -ne 0 ] && grep -q "pjt.inspect.operation-unsupported" /tmp/exec-inspect.out && pass "inspect fails closed on post-apply commands" || fail "inspect did not fail closed"

rm -f marker.txt
write_exec_blueprint '{ ...formatter, permissions: [] }'
node node_modules/@projitect/cli/bin/pjt.mjs build --force --force-dirty --yes --json > /tmp/exec-denied.out 2>&1
EXEC_DENIED=$?
[ $EXEC_DENIED -ne 0 ] && pass "build with a denied command exits nonzero" || fail "denied build exited 0"
grep -q '"id": "pjt.exec.command-not-permitted"' /tmp/exec-denied.out && pass "--json carries the not-permitted error id" || fail "no not-permitted error id"
[ ! -f marker.txt ] && pass "denied command was never started" || fail "denied command ran"
cd "$SMOKE"
rm -rf "$EXECDIR"

echo "=== 10. react blueprint from packed tarballs: add, build, install, vite build, test, dev server, drift, upgrade, remove ==="
# A published-package journey for a real app. Every package is packed with `pnpm pack` (which
# rewrites workspace:* to real versions, so the peer metadata is the published one) and served by
# the local registry; the app's React, Vite and Vitest dependencies come from the public registry, so
# this section needs network access (CI has it). Two versions of the React blueprint are served.
REACTREG="$(mktemp -d -t pjt-react-registry.XXXXXX)"
REACTDIR="$(mktemp -d -t pjt-react.XXXXXX)"
BASE_VERSION="$(node -p "require('${PKG}/core/package.json').version")"
(cd "$ROOT" && pnpm -r --filter "./packages/*" pack --pack-destination "$REACTREG" > /dev/null)
REACT_TGZ_BASE="$REACTREG/projitect-blueprint-react-${BASE_VERSION}.tgz"
pack_react() { # <version> <old> <new>: repack the blueprint as <version>; optionally rewrite one phrase in dist
  local dir="$REACTREG/react-$1"
  mkdir -p "$dir"
  tar -xzf "$REACT_TGZ_BASE" -C "$dir"
  for f in package.json dist/package.json; do
    node -e "
const fs = require('fs');
const p = process.argv[1];
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.version = process.argv[2];
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
" "$dir/package/$f" "$1"
  done
  [ -n "${2:-}" ] && sed -i.bak "s/$2/$3/" "$dir/package/dist/src/$4" && rm "$dir/package/dist/src/$4.bak"
  npm pack "$dir/package" --pack-destination "$REACTREG" --silent > /dev/null 2>&1
}
pack_react 1.0.0
pack_react 1.1.0 'preview: "vite preview"' 'preview: "vite preview --port 4173"' index.js
sed -i.bak 's/Hello from projitect/Hello from projitect 1.1/' "$REACTREG/react-1.1.0/package/dist/src/templates.js" && rm "$REACTREG/react-1.1.0/package/dist/src/templates.js.bak"
npm pack "$REACTREG/react-1.1.0/package" --pack-destination "$REACTREG" --silent > /dev/null 2>&1
cat > "$REACTREG/state.mjs" <<'EOF'
import { readdirSync, writeFileSync } from "node:fs"
const [dir, version, reactLatest] = process.argv.slice(2)
const react = (v) => `${dir}/projitect-blueprint-react-${v}.tgz`
const packages = readdirSync(dir)
  .filter((f) => f.startsWith("projitect-") && f.endsWith(`-${version}.tgz`) && f !== `projitect-${version}.tgz`)
  .map((f) => ({ name: `@projitect/${f.slice("projitect-".length, -`-${version}.tgz`.length)}`, file: f }))
  .filter(({ name }) => name !== "@projitect/blueprint-react")
  .map(({ name, file }) => ({ name, latest: version, tarballs: { [version]: `${dir}/${file}` } }))
packages.push({
  name: "@projitect/blueprint-react",
  latest: reactLatest,
  tarballs: { "1.0.0": react("1.0.0"), ...(reactLatest === "1.1.0" && { "1.1.0": react("1.1.0") }) },
})
writeFileSync(`${dir}/state.json`, JSON.stringify({ packages }))
EOF
publish_react() { node "$REACTREG/state.mjs" "$REACTREG" "$BASE_VERSION" "$1"; }
publish_react 1.0.0
node "${ROOT}/scripts/local-registry.mjs" "$REACTREG/state.json" "$REACTREG/port" &
REACT_REG_PID=$!
for _ in $(seq 1 40); do [ -s "$REACTREG/port" ] && break; sleep 0.25; done
[ -s "$REACTREG/port" ] && pass "local registry serves the packed packages" || fail "local registry did not start"

cd "$REACTDIR"
git init -q
git config user.email t@t
git config user.name t
# pnpm, like the repo itself: npm 10 crashes resolving any vitest 4.1 install ("edgesOut of null").
PNPM_SPEC="$(node -p "require('${ROOT}/package.json').packageManager")"
# The projitect blueprint owns `devDependencies.@projitect/cli` (a registry range), so an override keeps
# resolving that range to the packed CLI tarball across every `build` and `remodel`.
echo "{\"name\":\"smoke-react\",\"version\":\"0.0.0\",\"private\":true,\"type\":\"module\",\"packageManager\":\"${PNPM_SPEC}\",\"devDependencies\":{\"@projitect/cli\":\"^${BASE_VERSION}\"},\"pnpm\":{\"overrides\":{\"@projitect/cli\":\"file:${REACTREG}/projitect-cli-${BASE_VERSION}.tgz\"}}}" > package.json
printf 'node_modules/\n' > .gitignore
write_npmrc() { printf '@projitect:registry=http://127.0.0.1:%s/\n' "$(cat "$REACTREG/port")" > .npmrc; }
write_npmrc
# The CLI comes from its packed tarball through the override above.
EFFECT_VERSION="$(node -p "require('${PKG}/core/package.json').peerDependencies.effect")"
pnpm add -D "effect@${EFFECT_VERSION}" tsx > /tmp/react-cli-install.out 2>&1 || fail "installing the packed CLI failed: $(tail -5 /tmp/react-cli-install.out)"
REACT_BIN=node_modules/@projitect/cli/bin/pjt.mjs
# The `pjt init` starter, minus its registry install of projitect: `pjt add` splices at these anchors.
cat > .pjt.ts <<'EOF'
// pjt:projitect:imports start
import { pjt } from "@projitect/cli"
// pjt:projitect:imports end

// pjt:imports start
// pjt:imports end

export default pjt({
  blueprints: [
    // pjt:blueprints start
    // pjt:blueprints end
  ],
})
EOF

# Normal dependency installation: pnpm (detected from the lockfile) resolves the published peer metadata.
$REACT_BIN add @projitect/blueprint-react < /dev/null > /tmp/react-add.out 2>&1
[ $? -eq 0 ] && pass "pjt add @projitect/blueprint-react installs the packed package and its peers" || fail "pjt add failed: $(tail -5 /tmp/react-add.out)"
grep -q "react()," .pjt.ts && pass "pjt add spliced react() into .pjt.ts" || fail "react() not spliced"
for peer in blueprint blueprint-gitignore blueprint-tsconfig blueprint-vitest core; do
  ls node_modules/.pnpm | grep -q "^@projitect+$peer@" || fail "peer @projitect/$peer was not installed"
done
git add -A
git commit -qm "baseline"

$REACT_BIN build --force --yes > /tmp/react-build.out 2>&1
[ $? -eq 0 ] && pass "pjt build exits 0" || fail "pjt build failed: $(tail -5 /tmp/react-build.out)"
write_npmrc # `build` wipes everything but .pjt.ts, package.json and node_modules
for f in index.html src/main.tsx src/App.tsx src/App.test.tsx src/index.css vite.config.ts vitest.config.ts tsconfig.json; do
  [ -f "$f" ] && pass "$f created" || fail "$f missing"
done
grep -q "^dist/" .gitignore && pass ".gitignore ignores dist/" || fail "dist/ not ignored"
$REACT_BIN inspect > /dev/null 2>&1 && pass "inspect clean after build" || fail "react build left drift"
grep -A2 '"pjt:react"' .pjt.lock | grep -q '"version": "1.0.0"' && pass ".pjt.lock records the installed package version 1.0.0" || fail ".pjt.lock does not record 1.0.0"

pnpm install --no-frozen-lockfile > /tmp/react-install.out 2>&1
[ $? -eq 0 ] && pass "pnpm install of the generated dependencies succeeds" || fail "npm install failed: $(tail -3 /tmp/react-install.out)"
npm run build > /tmp/react-vite-build.out 2>&1
[ $? -eq 0 ] && [ -f dist/index.html ] && pass "npm run build (tsc + vite build) emits dist/index.html" || fail "vite build failed: $(tail -5 /tmp/react-vite-build.out)"
npm test > /tmp/react-test.out 2>&1
[ $? -eq 0 ] && grep -q "2 passed" /tmp/react-test.out && pass "generated test passes under vitest" || fail "generated test failed: $(tail -8 /tmp/react-test.out)"

node_modules/.bin/vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/react-dev.out 2>&1 &
VITE_PID=$!
PAGE=""
for _ in $(seq 1 60); do
  PAGE="$(curl -sf http://127.0.0.1:5199/ 2>/dev/null)" && break
  sleep 0.5
done
echo "$PAGE" | grep -q '/src/main.tsx' && pass "dev server serves index.html referencing src/main.tsx" || fail "dev server did not serve index.html"
curl -sf http://127.0.0.1:5199/src/App.tsx 2>/dev/null | grep -q "Hello from projitect" && pass "dev server serves the starter App component" || fail "dev server did not serve App.tsx"
kill "$VITE_PID" 2>/dev/null
wait "$VITE_PID" 2>/dev/null

# The starter source is the user's: editing it is never drift.
echo '// my edit' >> src/App.tsx
echo '<!-- my edit -->' >> index.html
$REACT_BIN inspect > /dev/null 2>&1 && pass "editing starter source leaves inspect clean" || fail "starter edit reported as drift"
$REACT_BIN remodel > /dev/null 2>&1
grep -q "// my edit" src/App.tsx && pass "remodel leaves edited starter source untouched" || fail "remodel overwrote src/App.tsx"

# A managed value drifts: inspect fails, remodel restores it and keeps the user's own keys.
npm pkg set scripts.lint="echo lint" > /dev/null
sed -i.bak 's/"dev": "vite"/"dev": "vite --open"/' package.json && rm package.json.bak
$REACT_BIN inspect > /dev/null 2>&1
[ $? -eq 1 ] && pass "managed package.json value drift detected (exit 1)" || fail "managed drift NOT detected"
$REACT_BIN remodel > /dev/null 2>&1
grep -q '"dev": "vite"' package.json && pass "remodel restores the managed script" || fail "managed script not restored"
grep -q '"lint": "echo lint"' package.json && pass "remodel keeps the user's own script" || fail "user script lost"
$REACT_BIN inspect > /dev/null 2>&1 && pass "clean after remodel restores the managed value" || fail "still dirty after restore"

# Upgrade: publish 1.1.0 (new managed preview script, new starter heading) and install it. The
# version `inspect` sees comes from the installed package in a separate process.
cp src/App.tsx App.edited
publish_react 1.1.0
pnpm add -D @projitect/blueprint-react@1.1.0 > /tmp/react-upgrade.out 2>&1
grep -q '"version": "1.1.0"' node_modules/@projitect/blueprint-react/package.json && pass "package manager upgraded to 1.1.0" || fail "upgrade to 1.1.0 failed: $(tail -3 /tmp/react-upgrade.out)"
UP_OUT=$($REACT_BIN inspect 2>&1)
UP_EXIT=$?
[ "$UP_EXIT" -eq 1 ] && pass "inspect after the upgrade, before remodel, exits 1" || fail "inspect exit was $UP_EXIT after upgrade"
echo "$UP_OUT" | grep -q "upgrade pjt:react 1.0.0 → 1.1.0" && pass "inspect reports the real 1.0.0 → 1.1.0 upgrade" || fail "inspect missed the upgrade"
cmp -s src/App.tsx App.edited && pass "inspect wrote nothing" || fail "inspect modified src/App.tsx"
$REACT_BIN remodel > /dev/null 2>&1
grep -q '"preview": "vite preview --port 4173"' package.json && pass "remodel applied the 1.1.0 managed script" || fail "1.1.0 managed script missing"
cmp -s src/App.tsx App.edited && pass "edited starter source survives the upgrade" || fail "upgrade touched src/App.tsx"
grep -q "Hello from projitect 1.1" src/App.tsx && fail "new starter template overwrote the seeded file" || pass "new starter template is not written over existing source"
grep -A2 '"pjt:react"' .pjt.lock | grep -q '"version": "1.1.0"' && pass ".pjt.lock records 1.1.0" || fail ".pjt.lock still at 1.0.0"
$REACT_BIN inspect > /dev/null 2>&1 && pass "clean after remodel of the upgrade" || fail "drift after upgrade remodel"

# Removing the blueprint deletes the maintained scaffolding, not the seeded source or user keys.
sed -i.bak '/react(),/d' .pjt.ts && rm .pjt.ts.bak
$REACT_BIN remodel > /dev/null 2>&1
[ ! -f vite.config.ts ] && [ ! -f vitest.config.ts ] && [ ! -f tsconfig.json ] && pass "removal deletes the owned scaffolding" || fail "owned files survived removal"
[ -f src/App.tsx ] && [ -f src/main.tsx ] && [ -f index.html ] && pass "removal keeps the seeded source" || fail "seeded source lost on removal"
grep -q '"lint": "echo lint"' package.json && pass "removal keeps the user's own package.json keys" || fail "user key lost on removal"
grep -q '"vite"' package.json && fail "managed devDependency survived removal" || pass "removal drops the managed package.json keys"
echo "=== 11. next blueprint from packed tarballs: add, build, install, next build, lint, test, drift, remove ==="
# Same registry as section 10, which already serves the packed `@projitect/blueprint-next`; the app's
# Next.js, React, ESLint and Vitest dependencies come from the public registry (network needed).
NEXTDIR="$(mktemp -d -t pjt-next.XXXXXX)"
cd "$NEXTDIR"
git init -q
git config user.email t@t
git config user.name t
echo "{\"name\":\"smoke-next\",\"version\":\"0.0.0\",\"private\":true,\"type\":\"module\",\"packageManager\":\"${PNPM_SPEC}\",\"devDependencies\":{\"@projitect/cli\":\"^${BASE_VERSION}\"},\"pnpm\":{\"overrides\":{\"@projitect/cli\":\"file:${REACTREG}/projitect-cli-${BASE_VERSION}.tgz\"}}}" > package.json
printf 'node_modules/\n' > .gitignore
write_npmrc
pnpm add -D "effect@${EFFECT_VERSION}" tsx > /tmp/next-cli-install.out 2>&1 || fail "installing the packed CLI failed: $(tail -5 /tmp/next-cli-install.out)"
NEXT_BIN=node_modules/@projitect/cli/bin/pjt.mjs
cat > .pjt.ts <<'PJT'
// pjt:projitect:imports start
import { pjt } from "@projitect/cli"
// pjt:projitect:imports end

// pjt:imports start
// pjt:imports end

export default pjt({
  blueprints: [
    // pjt:blueprints start
    // pjt:blueprints end
  ],
})
PJT
$NEXT_BIN add @projitect/blueprint-next < /dev/null > /tmp/next-add.out 2>&1
[ $? -eq 0 ] && pass "pjt add @projitect/blueprint-next installs the packed package and its peers" || fail "pjt add failed: $(tail -5 /tmp/next-add.out)"
grep -q "next()," .pjt.ts && pass "pjt add spliced next() into .pjt.ts" || fail "next() not spliced"
git add -A
git commit -qm "baseline"

$NEXT_BIN build --force --yes > /tmp/next-build.out 2>&1
[ $? -eq 0 ] && pass "pjt build exits 0" || fail "pjt build failed: $(tail -5 /tmp/next-build.out)"
write_npmrc # `build` wipes everything but .pjt.ts, package.json and node_modules
for f in src/app/layout.tsx src/app/page.tsx src/app/globals.css src/app/page.test.tsx eslint.config.mjs next.config.ts vitest.config.ts tsconfig.json; do
  [ -f "$f" ] && pass "$f created" || fail "$f missing"
done
grep -q "^\.next/" .gitignore && pass ".gitignore ignores .next/" || fail ".next/ not ignored"
$NEXT_BIN inspect > /dev/null 2>&1 && pass "inspect clean after build" || fail "next build left drift"

pnpm install --no-frozen-lockfile > /tmp/next-install.out 2>&1
[ $? -eq 0 ] && pass "pnpm install of the generated dependencies succeeds" || fail "pnpm install failed: $(tail -3 /tmp/next-install.out)"
pnpm run build > /tmp/next-prod-build.out 2>&1
[ $? -eq 0 ] && [ -f .next/BUILD_ID ] && pass "pnpm run build (the production next build) succeeds" || fail "next build failed: $(tail -8 /tmp/next-prod-build.out)"
$NEXT_BIN inspect > /dev/null 2>&1 && pass "next build leaves the managed files untouched (inspect clean)" || fail "next build rewrote a managed file"
pnpm run lint > /tmp/next-lint.out 2>&1
[ $? -eq 0 ] && pass "pnpm run lint passes with the seeded Next.js ESLint config" || fail "lint failed: $(tail -8 /tmp/next-lint.out)"
pnpm test > /tmp/next-test.out 2>&1
[ $? -eq 0 ] && grep -q "1 passed" /tmp/next-test.out && pass "generated test passes under vitest" || fail "generated test failed: $(tail -8 /tmp/next-test.out)"

# The starter source is the user's: editing it is never drift.
echo '// my edit' >> src/app/page.tsx
$NEXT_BIN inspect > /dev/null 2>&1 && pass "editing starter source leaves inspect clean" || fail "starter edit reported as drift"
$NEXT_BIN remodel > /dev/null 2>&1
grep -q "// my edit" src/app/page.tsx && pass "remodel leaves edited starter source untouched" || fail "remodel overwrote src/app/page.tsx"

# A managed value drifts: inspect fails, remodel restores it and keeps the user's own keys.
npm pkg set scripts.release="echo release" > /dev/null
sed -i.bak 's/"dev": "next dev"/"dev": "next dev --turbopack"/' package.json && rm package.json.bak
$NEXT_BIN inspect > /dev/null 2>&1
[ $? -eq 1 ] && pass "managed package.json value drift detected (exit 1)" || fail "managed drift NOT detected"
$NEXT_BIN remodel > /dev/null 2>&1
grep -q '"dev": "next dev"' package.json && pass "remodel restores the managed script" || fail "managed script not restored"
grep -q '"release": "echo release"' package.json && pass "remodel keeps the user's own script" || fail "user script lost"
$NEXT_BIN inspect > /dev/null 2>&1 && pass "clean after remodel restores the managed value" || fail "still dirty after restore"

# An owned file drifts: restored in full.
echo '// tampered' >> next.config.ts
$NEXT_BIN inspect > /dev/null 2>&1
[ $? -eq 1 ] && pass "owned next.config.ts drift detected (exit 1)" || fail "owned drift NOT detected"
$NEXT_BIN remodel > /dev/null 2>&1
grep -q "tampered" next.config.ts && fail "next.config.ts not restored" || pass "remodel restores next.config.ts"

# Removing the blueprint deletes the maintained scaffolding, not the seeded source or user keys.
sed -i.bak '/next(),/d' .pjt.ts && rm .pjt.ts.bak
$NEXT_BIN remodel > /dev/null 2>&1
[ ! -f next.config.ts ] && [ ! -f vitest.config.ts ] && [ ! -f tsconfig.json ] && pass "removal deletes the owned scaffolding" || fail "owned files survived removal"
[ -f src/app/page.tsx ] && [ -f src/app/layout.tsx ] && [ -f eslint.config.mjs ] && pass "removal keeps the seeded source" || fail "seeded source lost on removal"
grep -q '"release": "echo release"' package.json && pass "removal keeps the user's own package.json keys" || fail "user key lost on removal"
grep -q '"next"' package.json && fail "managed dependency survived removal" || pass "removal drops the managed package.json keys"
cd "$SMOKE"
rm -rf "$NEXTDIR"

kill "$REACT_REG_PID" 2>/dev/null
cd "$SMOKE"
rm -rf "$REACTDIR" "$REACTREG"

echo "=== FINAL ==="
[ $FAILED -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "FAILURES SEEN"; exit 1; }
