# CLI behavior

How `pjt` commands prompt, what they do without a terminal, and what they do when `.pjt.ts` is
missing. Read it before you add or change a prompt, a flag that replaces one, or a command's
config handling. Everything here is checked against the shipped code; where code and policy
differ, the page says so.

## Prompt policy

- A command may prompt only when stdin is a terminal (`process.stdin.isTTY`). Without a terminal
  it never prompts and behaves deterministically.
- Every prompt has a non-interactive equivalent: `--yes` for confirmations, `--section` for the
  section choice. CI and agents pass the flag; they never rely on a default answer.
- Prompts exist to make onboarding simple. They are never the only way to do something.
- Errors that follow from missing input are actionable: they name the flag or command that fixes
  them.

## Per-command rules

| Command | Prompts?                                                              | Without a terminal                                                                                                                              |
| ------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`  | Never.                                                                | `--yes` creates a missing `.git/` and `package.json`. Without `--yes` it fails with `pjt.init.git-missing` or `pjt.init.package-json-missing`.  |
| `add`   | Multi-select "Pick sections to add" when a package declares sections. | `--section a,b` is honoured verbatim. With no `--section` and no terminal, `add` installs every section the package declares. It never prompts. |
| `build` | Confirmation before the wipe, whenever `--yes` is absent.             | **Does not follow the policy.** There is no terminal check; see below.                                                                          |

`remodel`, `inspect` and `explain` never prompt.

### `build` is the exception

`pjt build` asks for confirmation whenever `--yes` is absent, with no terminal check. With piped
or closed stdin it prints the question, then Node exits with code 13 and the warning
`Detected unsettled top-level await` because nothing answers the prompt. In a terminal, Ctrl-C
cancels with exit 130. **Scripts must pass `--yes`.** Making `build` follow the policy is a
behaviour change and gets its own scoped, tested task; do not document it as done before then.

The confirmation runs after the `--force` and clean-git checks. The wipe also runs before
`.pjt.ts` is loaded (see below), so `pjt build --force --yes` with no `.pjt.ts` removes the
unpreserved files before it fails. A clean git check does not guarantee recovery of ignored
files. Initialise and verify the configuration before a destructive build; keep a separate
backup for content git does not track.

## Missing `.pjt.ts`

`remodel`, `inspect` and `explain` without an error id load `.pjt.ts` and fail with
`pjt.config.blueprint-file-not-found` (exit 1) when it is missing. The message tells the user to
run `pjt init`. They do not initialise automatically or offer an interactive init. `build` also
loads the file, but its wipe happens first (above).

`explain <error-id>` only looks up the error description and works without `.pjt.ts`. `add`
installs the package before it attempts to splice the configuration. If metadata and a section
selection lead to a splice and `.pjt.ts` is missing, it fails with `pjt.fs.read-failed` (exit 1);
the package may already be installed. That error currently says `Could not read .pjt.ts`, so
run `pjt init` before adding a blueprint. A package without metadata instead reports
`pjt.add.metadata-missing`, and an empty selection does not try to read or create `.pjt.ts`.

## Blueprint-argument prompts

Interactive prompts for blueprint arguments are not shipped and not a promised behaviour. Any
future one must follow the prompt policy above (terminal only, flag equivalent) and gets its own
scoped task with tests.

## Hand-check recipe for prompts

Run it whenever a change touches prompts, `packages/cli-internals/src/platform/terminal.ts`, or
`init`/`add` interaction. Tests and `scripts/smoke.sh` have no terminal, so a crash such as
`Terminal.readInput is not implemented` passed every automated check and only showed up in a real
terminal.

Needs Node, pnpm, Python 3.9+ and a Unix pseudo-terminal. Build packages with `pnpm build`
first. Run the shell blocks in one Bash session, starting at the repository root. These are
scripted pseudo-terminal checks; they do not replace a person's keyboard check or establish
Windows terminal support.

**Verified on 2026-11-10 with Node 22.12:** selection of the first two sections, remodel and
clean inspect; Ctrl-C with exit 0 and unchanged `.pjt.ts`; and non-TTY `--section` parity for
both the generated calls and `AGENTS.md`. The fixture used the locally packed packages and a
temporary registry, not unpublished workspace-directory installs or a moving Effect tag.

1. Pack the current public packages and serve them through the smoke test's local registry:

   ```bash
   ROOT=$PWD
   REG=$(mktemp -d)
   E2E=$(mktemp -d)
   VERSION=$(node -p "require('./packages/projitect/package.json').version")
   pnpm -r --filter './packages/*' pack --pack-destination "$REG"
   node --input-type=module - "$ROOT" "$REG" <<'JS'
   import fs from "node:fs"
   import path from "node:path"
   const [root, registry] = process.argv.slice(2)
   const packages = fs.readdirSync(path.join(root, "packages"), { withFileTypes: true })
     .filter((entry) => entry.isDirectory())
     .map((entry) => JSON.parse(fs.readFileSync(path.join(root, "packages", entry.name, "package.json"), "utf8")))
     .filter((pkg) => !pkg.private)
     .map((pkg) => ({
       name: pkg.name,
       latest: pkg.version,
       tarballs: {
         [pkg.version]: path.join(registry, `${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`),
       },
     }))
   fs.writeFileSync(path.join(registry, "state.json"), JSON.stringify({ packages }))
   JS
   node "$ROOT/scripts/local-registry.mjs" "$REG/state.json" "$REG/port" > "$REG/server.log" 2>&1 &
   REG_PID=$!
   python3 - "$REG/port" <<'PY'
   import pathlib, sys, time
   port = pathlib.Path(sys.argv[1])
   deadline = time.monotonic() + 10
   while not port.exists() and time.monotonic() < deadline:
       time.sleep(0.1)
   print(port.read_text().strip())
   PY
   ```

   The last command must print a port number. Keep `$REG_PID` for cleanup.

2. Install from those tarballs and initialise a scratch project:

   ```bash
   cd "$E2E"
   git init -q
   printf '{"name":"pty","version":"0.0.0","private":true,"type":"module"}\n' > package.json
   printf '@projitect:registry=http://127.0.0.1:%s/\n' "$(cat "$REG/port")" > .npmrc
   pnpm add -D "@projitect/cli@$VERSION"
   pnpm exec pjt init
   cp .pjt.ts "$REG/init.pjt.ts"
   ```

   Packing converts workspace dependency ranges into published ranges. The registry serves
   matching local packages; pnpm installs their pinned Effect peer and other dependencies.

3. Save this driver as `$REG/drive.py`, outside the project:

   ```python
   import os, pty, select, signal, sys, time

   keys = {"down": b"\x1b[B", "space": b" ", "enter": b"\r", "ctrl-c": b"\x03"}
   sequence = [keys[key] for key in sys.argv[1].split(",")]
   pid, fd = pty.fork()
   if pid == 0:
       os.execvp("node", ["node", "node_modules/@projitect/cli/bin/pjt.mjs", "add", "@projitect/blueprint-markdown"])
   output, sent, status = bytearray(), False, None
   deadline = time.monotonic() + 120
   try:
       while time.monotonic() < deadline:
           if select.select([fd], [], [], 0.2)[0]:
               try:
                   output.extend(os.read(fd, 65536))
               except OSError:
                   pass
           if not sent and b"Pick sections to add" in output:
               for key in sequence:
                   os.write(fd, key)
                   time.sleep(0.25)
               sent = True
           ended, raw_status = os.waitpid(pid, os.WNOHANG)
           if ended:
               status = os.waitstatus_to_exitcode(raw_status)
               break
       if status is None:
           os.kill(pid, signal.SIGTERM)
           os.waitpid(pid, 0)
           raise SystemExit("Prompt check timed out")
       print(output.decode(errors="replace"))
       print("exit:", status)
       if not sent or status != 0:
           raise SystemExit("Prompt check failed")
   finally:
       os.close(fd)
   ```

   Run `python3 "$REG/drive.py" down,down,space,down,space,enter` from `$E2E`. The list starts
   with `Select All`, then `Inverse Selection`, then the sections. The output must contain
   `Pick sections to add` and `Added to .pjt.ts: agentsPackageManager, agentsVerification.`
   Inspect `.pjt.ts` for exactly those two calls and the `markdownSnippets` import, then run:

   ```bash
   cp .pjt.ts "$REG/selected.pjt.ts"
   pnpm exec pjt remodel
   pnpm exec pjt inspect
   cp AGENTS.md "$REG/selected-agents.md"
   ```

   Inspect must exit 0.

4. Restore the initial configuration and cancel the prompt:

   ```bash
   cp "$REG/init.pjt.ts" .pjt.ts
   python3 "$REG/drive.py" ctrl-c
   cmp .pjt.ts "$REG/init.pjt.ts"
   ```

   The driver prints exit 0 and `cmp` exits 0: cancellation adds no calls.

5. Compare the non-TTY flag path with the selected result:

   ```bash
   pnpm exec pjt add @projitect/blueprint-markdown --section agentsPackageManager,agentsVerification < /dev/null
   cmp .pjt.ts "$REG/selected.pjt.ts"
   pnpm exec pjt remodel
   pnpm exec pjt inspect
   cmp AGENTS.md "$REG/selected-agents.md"
   ```

   Every command must exit 0. This checks both configuration and materialised-file parity.

6. Stop the fixture registry with `kill "$REG_PID"`, leave `$E2E`, then remove the two scratch
   directories when their logs are no longer needed. Record the date, Node version and whether
   the run was scripted or performed by a person in the website's `journey.mdx`.

### What `build` does without a terminal

`pjt build --force < /dev/null` (clean git, no `--yes`) prints the confirmation and then Node exits
13 with `Warning: Detected unsettled top-level await`. With `--yes` there is no prompt.
