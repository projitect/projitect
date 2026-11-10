"""Exercise destructive-build safety using a CLI installed from the smoke registry's tarballs."""

import json
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import sys
import tempfile
import time


modules = Path(sys.argv[1]).resolve()
binary = modules / "@projitect/cli/bin/pjt.mjs"


def prepare(root):
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    (root / ".gitignore").write_text("*\n")
    (root / "package.json").write_text('{"type":"module","private":true}')
    (root / "sentinel.txt").write_text("ignored user content")
    (root / "node_modules").symlink_to(modules, target_is_directory=True)


def run(root, *flags):
    return subprocess.run(
        ["node", str(binary), "build", "--force", *flags],
        cwd=root, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30,
    )


invalid = [
    (None, "pjt.config.blueprint-file-not-found"),
    ('throw new Error("broken import")', "pjt.loader.import-failed"),
    ('export default null', "pjt.loader.invalid-default-export"),
    ('export default { _tag: "ProjitectConfig" }', "pjt.loader.invalid-default-export"),
    ('export default { _tag: "ProjitectConfig", blueprints: null }', "pjt.loader.invalid-default-export"),
    ('export default { _tag: "ProjitectConfig", blueprints: [null] }', "pjt.loader.invalid-default-export"),
    ('export default { _tag: "ProjitectConfig", blueprints: [,] }', "pjt.loader.invalid-default-export"),
    ('export default { _tag: "ProjitectConfig", blueprints: [{ _tag: "Directory", name: "src", children: [null] }] }', "pjt.loader.invalid-default-export"),
]

for source, error_id in invalid:
    with tempfile.TemporaryDirectory(prefix="pjt-preflight-") as directory:
        root = Path(directory)
        prepare(root)
        if source is not None:
            (root / ".pjt.ts").write_text(source)
        result = run(root, "--yes", "--json")
        assert result.returncode == 1, (source, result.returncode, result.stdout, result.stderr)
        assert json.loads(result.stdout)["error"]["id"] == error_id, result.stdout
        assert (root / "sentinel.txt").read_text() == "ignored user content"
print("PASS packed build preserves ignored content for missing, throwing and malformed config")

with tempfile.TemporaryDirectory(prefix="pjt-preflight-nontty-") as directory:
    root = Path(directory)
    prepare(root)
    result = run(root, "--json")
    assert result.returncode == 1, (result.stdout, result.stderr)
    assert json.loads(result.stdout)["error"]["id"] == "pjt.apply.confirmation-required"
    assert "--yes" in result.stdout and "Continue?" not in result.stdout
    assert "unsettled" not in result.stderr
    assert (root / "sentinel.txt").exists()
print("PASS packed non-TTY build refuses promptly without prompting or deletion")

with tempfile.TemporaryDirectory(prefix="pjt-preflight-fresh-") as directory:
    root = Path(directory)
    prepare(root)
    # Counter is outside the wiped project, and each test gets a unique module URL.
    counter = root.parent / (root.name + "-imports")
    try:
        (root / ".pjt.ts").write_text('''
import { Effect } from "effect"
import { ownFile } from "@projitect/blueprint"
import { appendFileSync, existsSync } from "node:fs"
appendFileSync(%s, "imported\\n")
export default { _tag: "ProjitectConfig", blueprints: Effect.sync(() => [ownFile({
  id: "fresh", version: "1.0.0", path: "fresh.txt",
  content: existsSync("sentinel.txt") ? "stale" : "fresh"
})]) }
''' % json.dumps(str(counter)))
        result = run(root, "--yes", "--json")
        assert result.returncode == 0, (result.stdout, result.stderr)
        assert counter.read_text() == "imported\n"
        assert (root / "fresh.txt").read_text() == "fresh"
        assert not (root / "sentinel.txt").exists()
    finally:
        counter.unlink(missing_ok=True)
print("PASS packed build imports once and evaluates the Effect tree against the fresh filesystem")


def prompt_check(keys, expected_exit, deleted=False):
    with tempfile.TemporaryDirectory(prefix="pjt-preflight-tty-") as directory:
        root = Path(directory)
        prepare(root)
        (root / ".pjt.ts").write_text('export default { _tag: "ProjitectConfig", blueprints: [] }')
        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(root)
            os.execvp("node", ["node", str(binary), "build", "--force"])
        output, sent, status = bytearray(), False, None
        deadline = time.monotonic() + 30
        try:
            while time.monotonic() < deadline:
                if select.select([fd], [], [], 0.1)[0]:
                    try:
                        output.extend(os.read(fd, 65536))
                    except OSError:
                        pass
                if not sent and b"Continue?" in output:
                    # Let the prompt install its input listener before sending the keys.
                    time.sleep(0.2)
                    os.write(fd, keys)
                    sent = True
                ended, raw = os.waitpid(pid, os.WNOHANG)
                if ended:
                    status = os.waitstatus_to_exitcode(raw)
                    break
            if status is None:
                os.kill(pid, signal.SIGTERM)
                os.waitpid(pid, 0)
                raise RuntimeError("Build prompt timed out: " + output.decode(errors="replace"))
            assert sent and status == expected_exit, (status, output.decode(errors="replace"))
            if deleted:
                assert not (root / "sentinel.txt").exists()
                assert (root / ".pjt.lock").exists()
            else:
                assert (root / "sentinel.txt").read_text() == "ignored user content"
        finally:
            os.close(fd)


prompt_check(b"n\r", 0)
prompt_check(b"\x03", 130)
prompt_check(b"y\r", 0, deleted=True)
print("PASS packed TTY decline/Ctrl-C preserve files; explicit yes wipes and rebuilds")
