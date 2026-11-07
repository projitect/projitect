#!/usr/bin/env bash
# Verifies the packed tarballs of every published package: built output, LICENSE, lockstep
# version, license field and repository. Run after `pnpm build`.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

dest="$(mktemp -d)"
trap 'rm -rf "$dest"' EXIT

pnpm -r --filter "./packages/*" pack --pack-destination "$dest" >/dev/null

fail=0
versions=""
count=0
for tgz in "$dest"/*.tgz; do
  count=$((count + 1))
  name="$(basename "$tgz")"
  contents="$(tar -tzf "$tgz")"
  grep -qx "package/LICENSE" <<<"$contents" || { echo "$name: missing LICENSE"; fail=1; }
  grep -q "^package/dist/" <<<"$contents" || { echo "$name: missing dist/"; fail=1; }
  tar -xzOf "$tgz" package/LICENSE | cmp -s - LICENSE || { echo "$name: LICENSE differs from root"; fail=1; }
  manifest="$(tar -xzOf "$tgz" package/package.json)"
  node -e '
    const m = JSON.parse(process.argv[1])
    const ok = m.license === "MIT" && String(m.repository?.url ?? "").includes("github.com/projitect/projitect")
    if (!ok) { console.log(m.name + ": bad license or repository"); process.exit(1) }
  ' "$manifest" || fail=1
  versions+="$(node -p 'JSON.parse(process.argv[1]).version' "$manifest")"$'\n'
done

[ "$count" -gt 0 ] || { echo "no tarballs packed"; exit 1; }
[ "$(sort -u <<<"${versions}" | grep -c .)" -eq 1 ] || { echo "versions differ across packages"; fail=1; }

exit "$fail"
