---
"projitect": minor
---

The `init` → `add` → `remodel` → `inspect` journey now works end to end, in a terminal and without
one. `pjt add` shows its interactive section picker in a real terminal (the Node terminal layer
reads keypresses, and Ctrl-C leaves `.pjt.ts` unchanged). `pjt add` of a package without
`projitect` metadata now fails with the new `pjt.add.metadata-missing` error instead of printing a
notice and exiting 0. Plan-conflict, dirty-git, missing-git and drift messages now name the next
command to run. The website gains an "Install guidance and skills" guide and a checked GitHub
Actions workflow for `pjt inspect`.

New error id → **minor** per the AGENTS.md "Versioning (lockstep)" table.
