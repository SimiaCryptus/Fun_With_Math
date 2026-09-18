# SEO / Manifest Sync — Implementation Log

Status: **complete**

## Requests

1. Keep `entry.json` sidecars in sync when the compiled `manifest.json` is
   updated by an automated process.
2. Inject manifest metadata into each entry's target HTML as standardized
   SEO facets.

## Delivered

| File | Purpose |
| --- | --- |
| `scripts/sync-entries.ts` | **New.** Inverse of `build-manifest`: manifest → sidecars. |
| `scripts/apply-seo.ts` | **New.** Injects a managed SEO block into each entry's HTML. |
| `scripts/split-manifest.js` | Fixed import path (`./manifest_schema.ts`); updated next-step hint. |
| `package.json` | New scripts; `validate` and `build` wired up. |

## Data flow

```text
legacy *.json ──split-manifest──▶ entry.json ──build-manifest──▶ manifest.json
                                      ▲                               │
                                      └──────── sync-entries ─────────┘
                                      │
                                      └──────── apply-seo ──────▶ *.html (managed block)
```

`build-manifest → sync-entries` is a fixed point; `manifest:sync:check`
enforces it in CI.

## `sync-entries.ts`

- Reads `manifest.json`, writes each entry back to `entry.source`
  (falling back to `<dir>/entry.json`).
- Strips derived fields (`dir`, `source`, and `repo` unless `--keep-repo`);
  drops the `order: MAX_SAFE_INTEGER` "unset" sentinel.
- Re-anchors `href` / `readme` / `video` through
  `toPathRef(dir, resolvePathRef(dir, …))` so path form is canonical.
- Re-orders keys with `ENTRY_KEY_ORDER` and re-runs `validateEntryFile`
  before writing — an invalid entry is skipped, never persisted.
- Refuses to write outside the repository root.
- Flags: `--in`, `--only`, `--prune`, `--keep-repo`, `--dry-run`,
  `--check`, `--quiet`, `--help`.

## `apply-seo.ts`

- Walks all `entry.json` sidecars (same ignore list as `build-manifest`),
  resolves `href`, and patches the target HTML.
- All output lives between
  `<!-- manifest:seo:start … -->` and `<!-- manifest:seo:end -->`.
  Re-runs replace the region in place → **idempotent**; hand-authored
  `<head>` content is never touched.
- Emitted facets: `<link rel=canonical>`, `description`, `keywords`,
  OpenGraph (`og:type/site_name/title/description/url/image/video`),
  Twitter card, and JSON-LD.
- Schema type mapping: `lab → WebApplication`, `game → VideoGame`,
  `essay → Article` (uses `headline` instead of `name`).
- Description precedence: `subtitle` → plain-text `pitch` → `title`,
  truncated at ~200 chars on a word boundary.
- `<title>` is inserted only if absent; `--force-title` overwrites.
- Skips `hidden` entries, external hrefs, and non-HTML targets.
- `</script>` is escaped inside JSON-LD; attribute values are HTML-escaped.
- Flags: `--base`, `--image`, `--site-name`, `--twitter`, `--only`,
  `--force-title`, `--strip`, `--dry-run`, `--check`, `--quiet`, `--help`.

## Usage

```bash
npm run manifest:build                       # sidecars → manifest.json
npm run manifest:sync                        # manifest.json → sidecars
npm run seo:apply                            # sidecars → HTML SEO block
npx tsx scripts/apply-seo.ts --base=https://games.cognotik.com --twitter=@cognotik
npm run manifest:sync:check && npm run seo:check   # CI drift gates
```

## Notes / follow-ups

- Both scripts are dependency-free apart from `scripts/manifest_schema.ts`
  and run under the existing `tsx` devDependency.
- First `seo:apply` run will touch many HTML files; review that commit
  separately from logic changes.
- `--image` is a single site-wide fallback. Per-entry social images would
  need a new optional `image` field in `EntryFile` / `ENTRY_KEY_ORDER`.
- `scripts/generate-seo-pages.cjs` (`build:seo`) is unchanged and still
  generates standalone companion pages; `apply-seo` only annotates
  existing documents.