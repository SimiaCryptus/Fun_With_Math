---
specifies: impl.log.md
---

[package.json](../../package.json) calls [build-manifest.ts](../../scripts/build-manifest.ts) for manifest:build
REQUEST: we want to update manifest:split ([split-manifest.js](../../scripts/split-manifest.js)) or create a new tool to push updates to the individual entry.json files when the central manifest is updated, to keep things in sync if we have a process that updates the conpiled file

the manifest schema is documented at [manifest_schema.ts](../../scripts/manifest_schema.ts)

REQUEST: we want a new script (nodejs) that applies the inserts the manifest information as applicable for SEO purposes into the html file targeted by the entry.json automatically. this allows a standardized approach to seo facets

implement all requested files/changes, writing the final status to the very short final output artifact.
