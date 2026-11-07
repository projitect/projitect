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

cleanup() { [ -n "${REG_PID:-}" ] && kill "$REG_PID" 2>/dev/null; rm -rf "$SMOKE" "${REG:-}" "${E2E:-}"; }
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
TGZ1="$(ls "$REG"/*-1.0.0.tgz)"
TGZ2="$(ls "$REG"/*-1.1.0.tgz)"
publish() { # <latest>: rewrite the registry state; 1.1.0 is only listed once published
  if [ "$1" = "1.0.0" ]; then
    printf '{"name":"@projitect/blueprint-markdown","latest":"1.0.0","tarballs":{"1.0.0":"%s"}}' "$TGZ1" > "$REG/state.json"
  else
    printf '{"name":"@projitect/blueprint-markdown","latest":"%s","tarballs":{"1.0.0":"%s","1.1.0":"%s"}}' "$1" "$TGZ1" "$TGZ2" > "$REG/state.json"
  fi
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
  "effect@rc" "tsx" 2>&1 | tail -1
printf '@projitect:registry=http://127.0.0.1:%s/\n' "$(cat "$REG/port")" > .npmrc
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
npm pkg delete devDependencies.projitect > /dev/null 2>&1

# Publish 1.1.0 and upgrade with the package manager. Nothing has been remodelled yet.
publish 1.1.0
npm install -D --no-package-lock --silent @projitect/blueprint-markdown@1.1.0 > /dev/null 2>&1
grep -q '"version": "1.1.0"' node_modules/@projitect/blueprint-markdown/package.json && pass "package manager upgraded to 1.1.0" || fail "upgrade to 1.1.0 failed"
UP_OUT=$($BIN inspect 2>&1)
UP_EXIT=$?
[ "$UP_EXIT" -eq 1 ] && pass "inspect after the upgrade, before remodel, exits 1" || fail "inspect exit was $UP_EXIT after upgrade"
echo "$UP_OUT" | grep -q "upgrade pjt:markdown:agents:commits 1.0.0 → 1.1.0" && pass "inspect reports the real 1.0.0 → 1.1.0 upgrade" || fail "inspect missed the upgrade"
echo "$UP_OUT" | grep -q "modify AGENTS.md" && pass "inspect names AGENTS.md as changed" || fail "inspect did not name AGENTS.md"
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

kill "$REG_PID" 2>/dev/null
cd "$SMOKE"
rm -rf "$REG" "$E2E"

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
