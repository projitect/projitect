---
"@projitect/cli": patch
---

Make `pjt init` work when invoked through `pnpm dlx` in a project without local dependencies.
Install the running release's CLI and Effect dependencies before importing the generated
configuration. Reuse existing local installations without requiring a network call, and respect
the invoking package manager when the project has no lockfile. Synchronize newly installed
projects' package-manager lockfiles after applying the managed manifest, allowing frozen CI installs.
