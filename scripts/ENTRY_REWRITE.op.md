---
transforms:
  - (.*)/([^\.\/]+)\.md -> $1/entry.json
  - (.*)/([^\.\/]+)\.html -> $1/entry.json
  - (.*)/entry\.json -> $1/entry.json
related:
  - writing_style.md
---

Rewrite the entry json according to the documentation and [schema](manifest_schema.ts)
