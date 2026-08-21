/**
 * manifest/schema.ts
 *
 * Single source of truth for the unified content manifest.
 *
 * This module is deliberately dependency-free and isomorphic: it contains no
 * `node:` imports and only POSIX-style string path math, so it can be imported
 * by the build scripts, by a bundler, or directly by the site at runtime.
 */

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

export const MANIFEST_VERSION = 1 as const;

/** Filename of the per-directory sidecar written by `split-manifest`. */
export const ENTRY_FILENAME = 'entry.json';

/** Filename of the unified manifest written by `build-manifest`. */
export const MANIFEST_FILENAME = 'manifest.json';

export const CATEGORIES = ['lab', 'game', 'essay'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Where new entries of each category live by default. */
export const CATEGORY_ROOTS: Record<Category, string> = {
  lab: 'experiments',
  game: 'games',
  essay: 'essays',
};

/** Directories the builder scans for `entry.json` sidecars. */
export const SCAN_ROOTS: readonly string[] = ['experiments', 'games', 'essays'];

/** Never descend into these while scanning. */
export const SCAN_IGNORE: readonly string[] = [
  'node_modules',
  '.git',
  '.idea',
  'dist',
  'build',
  'vendor',
  'assets',
];

/** How deep below a scan root an `entry.json` may live. */
export const SCAN_MAX_DEPTH = 4;

export interface LegacySource {
  /** Root-relative path of the pre-unification manifest. */
  file: string;
  category: Category;
  /** Array-valued keys, in publication order. */
  sections: readonly string[];
  /** Section assigned to entries that have none. */
  defaultSection: string;
}

/**
 * The three manifests being unified. Also used in reverse by
 * `build-manifest --legacy` to regenerate them for backwards compatibility.
 */
export const LEGACY_SOURCES: readonly LegacySource[] = [
  { file: 'labs.json', category: 'lab', sections: ['featured', 'essays', 'demos'], defaultSection: 'featured' },
  { file: 'games.json', category: 'game', sections: ['games'], defaultSection: 'games' },
  { file: 'essays.json', category: 'essay', sections: ['essays'], defaultSection: 'essays' },
];

/** Canonical key order for serialized entries (stable diffs). */
export const ENTRY_KEY_ORDER: readonly string[] = [
  'id',
  'category',
  'section',
  'order',
  'icon',
  'title',
  'subtitle',
  'href',
  'readme',
  'video',
  'launchLabel',
  'pitch',
  'tags',
  'hidden',
];

/** Key order used when regenerating the legacy manifests. */
export const LEGACY_KEY_ORDER: readonly string[] = [
  'icon',
  'title',
  'href',
  'readme',
  'video',
  'subtitle',
  'launchLabel',
  'pitch',
];

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/**
 * A path reference inside an `entry.json`. Three flavors:
 *
 *  1. `index.html`            – relative to the entry's own directory.
 *  2. `/videos/demo.mp4`      – relative to the *site root* (shared assets).
 *  3. `https://example.com/`  – absolute URL, passed through untouched.
 *
 * `resolvePathRef()` collapses all three into a root-relative path.
 */
export type PathRef = string;

/** The on-disk shape of a per-directory `entry.json`. */
export interface EntryFile {
  /** Stable slug; unique across the whole site. */
  id: string;
  category: Category;
  /** Publication bucket, e.g. `featured` | `demos` | `games` | `essays`. */
  section?: string;
  /** Sort key within the section. Missing sorts last, then by title. */
  order?: number;
  /** Two-or-three character badge (or an emoji). */
  icon: string;
  title: string;
  subtitle?: string;
  href: PathRef;
  readme?: PathRef;
  video?: PathRef;
  launchLabel?: string;
  /** Short HTML-bearing blurb. */
  pitch?: string;
  tags?: string[];
  /** Excluded from the published manifest when true. */
  hidden?: boolean;
}

/** An entry after resolution, as it appears in the unified manifest. */
export interface ManifestEntry extends EntryFile {
  section: string;
  order: number;
  /** Root-relative directory that owns this entry. */
  dir: string;
  /** Root-relative path of the sidecar it came from. */
  source: string;
}

export interface UnifiedManifest {
  version: number;
  generatedAt: string;
  counts: Record<string, number>;
  entries: ManifestEntry[];
}

/* ------------------------------------------------------------------ *
 * POSIX path helpers (string-only, browser safe)
 * ------------------------------------------------------------------ */

export function isExternal(p: string): boolean {
  return /^[a-z][a-z0-9+.\-]*:/i.test(p) || p.startsWith('//');
}

export function isRootRelative(p: string): boolean {
  return p.startsWith('/');
}

/** Split `path?query#hash` into `[path, suffix]`. */
export function splitPathSuffix(p: string): [string, string] {
   // `[\s\S]` so a stray newline in a query/hash does not silently truncate.
   const m = /^([^?#]*)([?#][\s\S]*)?$/.exec(p);
  return [m?.[1] ?? p, m?.[2] ?? ''];
}

export function normalizePosix(p: string): string {
  const abs = p.startsWith('/');
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!abs) out.push('..');
      continue;
    }
    out.push(part);
  }
  return (abs ? '/' : '') + out.join('/');
}

export function joinPosix(...parts: (string | undefined)[]): string {
  return normalizePosix(parts.filter(Boolean).join('/'));
}

export function dirnamePosix(p: string): string {
  const i = p.lastIndexOf('/');
  if (i < 0) return '';
  if (i === 0) return '/';
  return p.slice(0, i);
}

export function basenamePosix(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
/** Keys that carry comments/metadata rather than content (`$schema`, `//`). */
export function isMetaKey(key: string): boolean {
   return key.startsWith('$') || key === '//';
}

/* ------------------------------------------------------------------ *
 * Path <-> entry-directory translation
 * ------------------------------------------------------------------ */

/**
 * Rewrite a root-relative path for storage inside `<dir>/entry.json`.
 * Paths under `dir` become directory-relative; everything else is anchored
 * to the site root with a leading `/`.
 */
export function toPathRef(dir: string, value: string): PathRef {
   // An empty reference stays empty: callers must decide whether that is fatal.
   // (Previously this produced a bare "/", which then passed validation.)
   if (!value) return '';
  if (isExternal(value)) return value;
  const [pathPart, suffix] = splitPathSuffix(value);
  const norm = normalizePosix(pathPart.replace(/^\/+/, ''));
  const prefix = dir ? `${normalizePosix(dir)}/` : '';
  if (prefix && norm.startsWith(prefix)) return norm.slice(prefix.length) + suffix;
  return `/${norm}${suffix}`;
}

/** Inverse of {@link toPathRef}: produce a root-relative path (or URL). */
export function resolvePathRef(dir: string, value: PathRef): string {
  if (isExternal(value)) return value;
  const [pathPart, suffix] = splitPathSuffix(value);
  if (isRootRelative(pathPart)) return normalizePosix(pathPart).replace(/^\/+/, '') + suffix;
  return joinPosix(dir, pathPart) + suffix;
}

/** Resolve every path field of an entry against its directory, in place-safe fashion. */
export function resolveEntryPaths<T extends EntryFile>(entry: T, dir: string): T {
  const out = { ...entry };
  out.href = resolvePathRef(dir, entry.href);
  if (entry.readme !== undefined) out.readme = resolvePathRef(dir, entry.readme);
  if (entry.video !== undefined) out.video = resolvePathRef(dir, entry.video);
  return out;
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/** Pick the directory that should own an entry, given its (root-relative) paths. */
export function entryDirFor(input: {
  category: Category;
  href?: string;
  readme?: string;
  title: string;
}): string {
  const localDir = (p?: string): string => {
    if (!p || isExternal(p)) return '';
    const [pathPart] = splitPathSuffix(p);
    const dir = dirnamePosix(normalizePosix(pathPart.replace(/^\/+/, '')));
    return dir === '/' ? '' : dir;
  };
  return (
    localDir(input.href) ||
    localDir(input.readme) ||
    joinPosix(CATEGORY_ROOTS[input.category], slugify(input.title))
  );
}

export function entryIdFromDir(dir: string, fallbackTitle = ''): string {
  return slugify(basenamePosix(dir)) || slugify(fallbackTitle) || 'entry';
}
/**
  * Return `base` (slugified) if free, otherwise `base-2`, `base-3`, … so the
  * result is guaranteed absent from `taken`.
  */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
   const seed = slugify(base) || 'entry';
   if (!taken.has(seed)) return seed;
   let n = 2;
   while (taken.has(`${seed}-${n}`)) n += 1;
   return `${seed}-${n}`;
}

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

export function categoryRank(category: Category): number {
  const i = CATEGORIES.indexOf(category);
  return i < 0 ? CATEGORIES.length : i;
}

export function sectionRank(category: Category, section: string): number {
  const src = LEGACY_SOURCES.find((s) => s.category === category);
  const i = src ? src.sections.indexOf(section) : -1;
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

export function compareEntries(a: ManifestEntry, b: ManifestEntry): number {
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    sectionRank(a.category, a.section) - sectionRank(b.category, b.section) ||
    a.section.localeCompare(b.section) ||
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

/* ------------------------------------------------------------------ *
 * Validation & serialization
 * ------------------------------------------------------------------ */

const REQUIRED_STRINGS = ['id', 'icon', 'title', 'href'] as const;
const OPTIONAL_STRINGS = ['section', 'subtitle', 'readme', 'video', 'launchLabel', 'pitch'] as const;

/** Structural validation. Returns a list of human-readable problems. */
export function validateEntryFile(raw: unknown, source = '<memory>'): string[] {
  const errors: string[] = [];
  const at = (msg: string) => `${source}: ${msg}`;

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return [at('expected a JSON object')];
  }
  const e = raw as Record<string, unknown>;

  for (const key of REQUIRED_STRINGS) {
    if (typeof e[key] !== 'string' || !(e[key] as string).trim()) {
      errors.push(at(`missing or empty required string field "${key}"`));
    }
  }
  if (typeof e.category !== 'string' || !CATEGORIES.includes(e.category as Category)) {
    errors.push(at(`"category" must be one of ${CATEGORIES.join(' | ')}`));
  }
  for (const key of OPTIONAL_STRINGS) {
    if (e[key] !== undefined && typeof e[key] !== 'string') {
      errors.push(at(`"${key}" must be a string when present`));
    }
  }
  if (e.order !== undefined && (typeof e.order !== 'number' || !Number.isFinite(e.order))) {
    errors.push(at('"order" must be a finite number when present'));
  }
  if (e.hidden !== undefined && typeof e.hidden !== 'boolean') {
    errors.push(at('"hidden" must be a boolean when present'));
  }
  if (e.tags !== undefined && (!Array.isArray(e.tags) || e.tags.some((t) => typeof t !== 'string'))) {
    errors.push(at('"tags" must be an array of strings when present'));
  }
  if (typeof e.id === 'string' && e.id !== slugify(e.id)) {
    errors.push(at(`"id" must be a slug (got "${e.id}", expected "${slugify(e.id)}")`));
  }
   if (typeof e.href === 'string' && (e.href.trim() === '/' || e.href.trim() === '.')) {
     errors.push(at('"href" must point at a file, not a bare directory root'));
   }
   const unknown = Object.keys(e).filter((k) => !ENTRY_KEY_ORDER.includes(k) && !isMetaKey(k));
  if (unknown.length) errors.push(at(`unknown field(s): ${unknown.join(', ')}`));

  return errors;
}

/** Re-key an object into a canonical order, dropping `undefined` values. */
export function orderKeys<T extends Record<string, unknown>>(obj: T, order: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const key of order) if (obj[key] !== undefined) out[key] = obj[key];
  for (const key of Object.keys(obj)) if (!(key in out) && obj[key] !== undefined) out[key] = obj[key];
  return out as T;
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Strip the manifest-only bookkeeping fields for legacy consumers. */
export function toLegacyEntry(entry: ManifestEntry): Record<string, unknown> {
  const resolved = resolveEntryPaths(entry, entry.dir);
  const { id, category, section, order, dir, source, hidden, tags, ...rest } = resolved as ManifestEntry;
  void id; void category; void section; void order; void dir; void source; void hidden; void tags;
  return orderKeys(rest as Record<string, unknown>, LEGACY_KEY_ORDER);
}