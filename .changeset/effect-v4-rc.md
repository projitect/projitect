---
"projitect": patch
---

Migrate the lockstep package suite to `effect@4.0.0-rc.111`. Published peer dependencies now
require the release candidate, serialized errors use the RC `Schema.TaggedError` API, and the Node
platform layer implements the RC filesystem glob contract. CLI boolean flags retain their existing
optional, default-false behavior.
