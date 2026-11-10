---
"@projitect/cli": minor
---

`pjt add` now accepts versioned specs such as `@scope/name@1.2.3`, `name@^1` and `@scope/name@latest`: the package manager receives the full spec and metadata is read from the resolved package name. Aliases, URL, tarball, file, git and workspace specs, and names that could escape `node_modules`, are rejected before install with the new `pjt.add.spec-unsupported` error. `pjt.add.metadata-missing` now names the package instead of the raw spec.
