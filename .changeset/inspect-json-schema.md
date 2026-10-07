---
"projitect": minor
---

`pjt inspect --json` now carries a `$schema` key naming a published, versioned JSON Schema
(draft 2020-12) at `https://projitect.dev/schemas/inspect.v1.json`. The schema is generated
from the same definition the command encodes its output through, so it can't drift from the
code, and it accepts unknown additional keys so future minor releases can add fields without
breaking consumers.
