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

cleanup() { rm -rf "$SMOKE"; }
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
  "file:${PKG}/blueprint-tsconfig" \
  "effect@rc" "tsx" 2>&1 | tail -1

BIN=node_modules/projitect/bin/pjt.mjs

echo "=== 1. CLI surface ==="
$BIN --help 2>&1 | grep -q "init"    && pass "--help lists init"    || fail "--help missing init"
$BIN --help 2>&1 | grep -q "build"   && pass "--help lists build"   || fail "--help missing build"
$BIN --help 2>&1 | grep -q "add"     && pass "--help lists add"     || fail "--help missing add"
$BIN --completions bash 2>&1 | grep -q "begin-pjt-completions" && pass "--completions bash emits script" || fail "completions broken"

echo "=== 2. pjt init ==="
$BIN init > /dev/null 2>&1
[ -f .pjt.ts ]   && pass ".pjt.ts created"          || fail ".pjt.ts missing"
[ -f .pjt.lock ] && pass ".pjt.lock created"        || fail ".pjt.lock missing"
grep -q '"projitect"' package.json && pass "package.json got projitect devDep" || fail "no projitect devDep"
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

echo "=== 6. explain ==="
OUT=$($BIN explain pjt.lock.parse-failed 2>&1)
echo "$OUT" | grep -q "pjt.lock.parse-failed" && pass "explain renders" || fail "explain broken"
echo "$OUT" | grep -q "projitect.dev/errors" && pass "explain links docs url" || fail "no docs url"

echo "=== 6b. inspect --json emits structured output ==="
JSON_OUT=$($BIN inspect --json 2>&1)
echo "$JSON_OUT" | grep -q '"hasDrift"' && pass "--json includes hasDrift" || fail "no hasDrift in JSON"
echo "$JSON_OUT" | grep -q '"files"'    && pass "--json includes files"    || fail "no files in JSON"
echo "$JSON_OUT" | grep -q '"removals"' && pass "--json includes removals" || fail "no removals in JSON"
echo "$JSON_OUT" | grep -q '"upgrades"' && pass "--json includes upgrades" || fail "no upgrades in JSON"
echo "$JSON_OUT" | python3 -c "import sys, json; json.loads(sys.stdin.read())" > /dev/null 2>&1 && pass "--json output is valid JSON" || fail "--json output is malformed"

echo "=== 7. init refuses without git ==="
NOGIT="$(mktemp -d -t pjt-nogit.XXXXXX)"
cp -r "${SMOKE}/node_modules" "${NOGIT}/"
cd "$NOGIT"
echo '{"name":"x","version":"0","private":true}' > package.json
node node_modules/projitect/bin/pjt.mjs init 2>&1 | grep -q "pjt.init.git-missing" && pass "init refuses without git" || fail "no git error"
cd "$SMOKE"
rm -rf "$NOGIT"

echo "=== 7b. init --yes auto-bootstraps missing git + package.json ==="
YESDIR="$(mktemp -d -t pjt-yes.XXXXXX)"
cp -r "${SMOKE}/node_modules" "${YESDIR}/"
cd "$YESDIR"
# Neither .git nor package.json present.
[ ! -d .git ] && [ ! -f package.json ] && pass "yes-test starts clean" || fail "yes-test dirty start"
node node_modules/projitect/bin/pjt.mjs init --yes > /tmp/init-yes.out 2>&1
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
$BIN build --force 2>&1 | grep -q "dirty-git" && pass "build refuses on dirty git" || fail "dirty-git not caught"

echo "=== 9. build --force --force-dirty --yes wipes + rebuilds ==="
mkdir -p src docs
echo s > src/foo.txt
echo s > docs/bar.md
$BIN build --force --force-dirty --yes 2>&1 | grep -q "Wiped" && pass "build wiped + rebuilt" || fail "build flow broken"
[ -f .gitignore ] && pass ".gitignore rebuilt"      || fail "gitignore missing post-build"
[ -d src ]        && fail "src not wiped"           || pass "src wiped"
[ -d docs ]       && fail "docs not wiped"          || pass "docs wiped"
[ -f package.json ] && pass "package.json preserved"|| fail "package.json wiped"

echo "=== FINAL ==="
[ $FAILED -eq 0 ] && { echo "ALL PASS"; exit 0; } || { echo "FAILURES SEEN"; exit 1; }
