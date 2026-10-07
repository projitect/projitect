---
"projitect": patch
---

Every published package now declares a `repository` field pointing at
`github.com/projitect/projitect`, the project's current canonical GitHub home. The changesets
changelog generator and the marketing site's GitHub links (header icon, homepage "View on GitHub"
action) now target the same repository instead of the stale `kapilkale/projitect` slug.

Doc/metadata change only, no API change → **patch** per the AGENTS.md "Versioning (lockstep)"
table.
