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
unpreserved files before it fails. The git-clean requirement means they are recoverable.

## Missing `.pjt.ts`

Commands other than `init` fail with `pjt.config.blueprint-file-not-found` (exit 1) when
`.pjt.ts` is missing. The message is "No blueprint file found at <path>. Run `pjt init` to create
one." They never initialise automatically and never offer an interactive init. `remodel` and
`inspect` fail before touching anything; `build` fails after its wipe (above).

## Blueprint-argument prompts

Interactive prompts for blueprint arguments are not shipped and not a promised behaviour. Any
future one must follow the prompt policy above (terminal only, flag equivalent) and gets its own
scoped task with tests.

## Hand-check recipe for prompts

Run it whenever a change touches prompts, `packages/cli-internals/src/platform/terminal.ts`, or
`init`/`add` interaction. Tests and `scripts/smoke.sh` have no terminal, so a crash such as
`Terminal.readInput is not implemented` passed every automated check and only showed up in a real
terminal.

Needs Node, `npm`, `python3` and built packages (`pnpm build`). Run from the repo root.

1. Pack and serve the blueprint, the way `scripts/smoke.sh` section 5d does:

   ```bash
   REG=$(mktemp -d); E2E=$(mktemp -d); ROOT=$PWD
   mkdir -p $REG/pkg/package
   cp -r packages/blueprint-markdown/dist packages/blueprint-markdown/package.json $REG/pkg/package/
   # strip peerDependencies/devDependencies/scripts from package.json and dist/package.json (see pack_markdown)
   npm pack $REG/pkg/package --pack-destination $REG --silent
   printf '{"packages":[{"name":"@projitect/blueprint-markdown","latest":"1.0.0","tarballs":{"1.0.0":"%s"}}]}' $REG/projitect-blueprint-markdown-1.0.0.tgz > $REG/state.json
   node scripts/local-registry.mjs $REG/state.json $REG/port &
   ```

   Wait until `$REG/port` is non-empty. Simplest: copy the `pack_markdown` function out of
   `scripts/smoke.sh` and call `pack_markdown 1.0.0`.

2. Create the scratch project and install the CLI into it:

   ```bash
   cd $E2E && git init -q && git config user.email t@t && git config user.name t
   echo '{"name":"pty","version":"0.0.0","private":true,"type":"module"}' > package.json
   npm install --no-package-lock --silent file:$ROOT/packages/{core,blueprint,cli-internals,projitect} effect@rc tsx
   printf '@projitect:registry=http://127.0.0.1:%s/\n' $(cat $REG/port) > .npmrc
   node_modules/projitect/bin/pjt.mjs init
   ```

3. Drive `add` through a pseudo-terminal. Save this as `$REG/drive.py` (outside the project):

   ```python
   import os, pty, sys, time, select

   keys = {"down": b"\x1b[B", "space": b" ", "enter": b"\r", "ctrl-c": b"\x03"}
   script = sys.argv[1].split(",")  # e.g. space,down,space,enter or ctrl-c
   pid, fd = pty.fork()
   if pid == 0:
       os.execvp("node", ["node", "node_modules/projitect/bin/pjt.mjs", "add", "@projitect/blueprint-markdown"])

   def drain(wait=0.5):
       out = b""
       while select.select([fd], [], [], wait)[0]:
           try:
               chunk = os.read(fd, 4096)
           except OSError:
               break
           if not chunk:
               break
           out += chunk
       return out

   seen = drain(8)  # the package install takes a moment
   for k in script:
       os.write(fd, keys[k])
       seen += drain()
   seen += drain(3)
   _, status = os.waitpid(pid, 0)
   sys.stdout.write(seen.decode(errors="replace"))
   print("\nexit:", os.waitstatus_to_exitcode(status))
   ```

   Run `python3 $REG/drive.py space,down,space,enter` from `$E2E`. The output contains
   `Pick sections to add`, and `.pjt.ts` gains exactly the two toggled calls. Then run
   `node_modules/projitect/bin/pjt.mjs remodel` and `... inspect`; inspect exits 0.

4. Reset `.pjt.ts` (`git checkout .pjt.ts`, or `init` again in a fresh project) and run
   `python3 $REG/drive.py ctrl-c`. `.pjt.ts` is unchanged and the exit is 0.

5. Compare with the non-interactive path: `pjt add @projitect/blueprint-markdown --section <the two names>` installs the same files.

6. Clean up: `kill %1` the registry and remove `$REG` and `$E2E`.

Record the date and result in the "Last run" paragraph of the website's `journey.mdx`.

### What `build` does without a terminal

`pjt build --force < /dev/null` (clean git, no `--yes`) prints the confirmation and then Node exits
13 with `Warning: Detected unsettled top-level await`. With `--yes` there is no prompt.
