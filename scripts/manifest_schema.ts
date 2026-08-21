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

/** Bumped to 2 when entries gained the autodiscovered `repo` block. */
export const MANIFEST_VERSION = 2 as const;

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
   'repo',
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
/** Canonical key order inside an entry's `repo` block. */
export const REPO_KEY_ORDER: readonly string[] = [
   'url',
   'remote',
   'host',
   'slug',
   'path',
   'subpath',
   'commit',
   'branch',
   'submodule',
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
/**
  * Where an entry's source actually lives in version control.
  *
  * Autodiscovered by `build-manifest` from `.gitmodules` + `git submodule
  * status`; anything written explicitly into an `entry.json` overrides the
  * discovered value field-by-field.
  */
export interface RepoInfo {
   /** Canonical browse URL, e.g. `https://github.com/user/project`. */
   url?: string;
   /** Raw remote as configured, when it differs from `url` (ssh, relative…). */
   remote?: string;
   /** Host inferred from `url`, e.g. `github.com`. */
   host?: string;
   /** Path within the host, e.g. `user/project`. */
   slug?: string;
   /** Root-relative checkout path (`''` = this repository). */
   path?: string;
   /** Path of the entry *inside* that repository (`''` = repo root). */
   subpath?: string;
   /** Pinned commit — the submodule gitlink, not a moving branch head. */
   commit?: string;
   /** Tracked branch, when `.gitmodules` declares one. */
   branch?: string;
   /** True when the checkout is a submodule of the outer repository. */
   submodule?: boolean;
}
/** One `[submodule "…"]` stanza of a `.gitmodules` file. */
export interface GitModule {
   name: string;
   /** Root-relative checkout path. */
   path: string;
   /** Raw `url =` value; may be relative (`../other.git`). */
   url: string;
   /** `branch =` value; `.` means "track the superproject's branch". */
   branch?: string;
}
/** One line of `git submodule status`. */
export interface SubmoduleStatus {
   /** `' '` in sync, `'-'` uninitialized, `'+'` moved, `'U'` conflicted. */
   state: ' ' | '-' | '+' | 'U';
   commit: string;
   path: string;
   /** Ref shown in parentheses, with a leading `heads/` stripped. */
   ref?: string;
}

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
   /**
    * Optional override for repository discovery. A bare string is treated as
    * the remote URL; an object overrides individual {@link RepoInfo} fields.
    */
   repo?: RepoInfo | string;
}

/** An entry after resolution, as it appears in the unified manifest. */
export interface ManifestEntry extends EntryFile {
  section: string;
  order: number;
  /** Root-relative directory that owns this entry. */
  dir: string;
  /** Root-relative path of the sidecar it came from. */
  source: string;
   /** Resolved repository provenance (always an object here, never a string). */
   repo?: RepoInfo;
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
  * Git repository discovery (pure string helpers, no `node:` imports)
  * ------------------------------------------------------------------ */
/** Turn any remote spelling into a canonical, browsable https URL. */
export function normalizeGitUrl(remote: string): string {
   const raw = (remote ?? '').trim();
   if (!raw) return '';
   // Plain filesystem remotes are left alone: there is nothing to browse.
   if (raw.startsWith('/') || raw.startsWith('.') || /^file:\/\//i.test(raw)) {
     return raw.replace(/\/+$/, '');
   }
   let url = raw;
   // scp-like shorthand: git@host:owner/name.git
   const scp = /^(?:[^@\s/]+@)?([^\s:/]+):([^\s].*)$/.exec(url);
   if (scp && !url.includes('://')) url = `https://${scp[1]}/${scp[2]}`;
   url = url.replace(/^(?:ssh|git|git\+ssh|git\+https):\/\//i, 'https://');
   url = url.replace(/^(https?:\/\/)[^/@]+@/i, '$1'); // drop embedded credentials
   url = url.replace(/\/+$/, '').replace(/\.git$/i, '');
   return url;
}
/** Resolve a relative submodule url (`../x.git`) against the outer remote. */
export function resolveGitUrl(base: string, ref: string): string {
   if (!/^\.{1,2}\//.test(ref)) return ref;
   const b = normalizeGitUrl(base);
   if (!b) return ref;
   const m = /^([a-z][a-z0-9+.\-]*:\/\/[^/]+)(\/.*)?$/i.exec(b);
   if (!m) return normalizePosix(`${b}/${ref}`);
   const joined = normalizePosix(`${m[2] ?? '/'}/${ref}`);
   return `${m[1]}${joined.startsWith('/') ? joined : `/${joined}`}`;
}
export function repoHost(url: string): string {
   return /^[a-z][a-z0-9+.\-]*:\/\/([^/]+)/i.exec(url)?.[1] ?? '';
}
/** `https://github.com/user/project` → `user/project` (nested groups kept). */
export function repoSlug(url: string): string {
   const m = /^[a-z][a-z0-9+.\-]*:\/\/[^/]+\/(.+)$/i.exec(url);
   if (!m) return '';
   return m[1].replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
}
/** Parse a `.gitmodules` file. Unknown sections and comments are ignored. */
export function parseGitmodules(text: string): GitModule[] {
   const out: GitModule[] = [];
   let cur: Partial<GitModule> | null = null;
   const commit = () => {
     if (cur?.path) out.push({ name: cur.name || cur.path, path: cur.path, url: cur.url ?? '', branch: cur.branch });
     cur = null;
   };
   for (const line of (text ?? '').split(/\r?\n/)) {
     const trimmed = line.trim();
     if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
     if (trimmed.startsWith('[')) {
       commit();
       const section = /^\[submodule\s+"?([^"\]]*)"?\]$/i.exec(trimmed);
       if (section) cur = { name: section[1] };
       continue;
     }
     if (!cur) continue;
     const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(trimmed);
     if (!kv) continue;
     const key = kv[1].toLowerCase();
     const value = kv[2].trim().replace(/^"|"$/g, '');
     if (key === 'path') cur.path = normalizePosix(value.replace(/^\.\//, ''));
     else if (key === 'url') cur.url = value;
     else if (key === 'branch') cur.branch = value;
   }
   commit();
   return out;
}
/**
  * Parse `git submodule status` output (the same shape as `submodules.txt`):
  * `" <sha> <path> (heads/main)"`, optionally prefixed with `-`, `+` or `U`.
  */
export function parseSubmoduleStatus(text: string): SubmoduleStatus[] {
   const out: SubmoduleStatus[] = [];
   for (const line of (text ?? '').split(/\r?\n/)) {
     if (!line.trim()) continue;
     const m = /^([-+U ]?)\s*([0-9a-f]{7,40})\s+(\S+)(?:\s+\((.*)\))?\s*$/i.exec(line);
     if (!m) continue;
     out.push({
       state: ((m[1] || ' ') as SubmoduleStatus['state']),
       commit: m[2],
       path: normalizePosix(m[3]),
       ref: m[4]?.replace(/^heads\//, ''),
     });
   }
   return out;
}
/** Longest checkout path in `paths` that contains `dir`, or `null`. */
export function matchRepoPath(dir: string, paths: readonly string[]): string | null {
   const target = normalizePosix(dir);
   let best: string | null = null;
   for (const candidate of paths) {
     const p = normalizePosix(candidate);
     if (!p) continue;
     if (target === p || target.startsWith(`${p}/`)) {
       if (!best || p.length > best.length) best = p;
     }
   }
   return best;
}
/** `relativeUnder('games', 'games/wordsearch')` → `'wordsearch'`. */
export function relativeUnder(base: string, target: string): string {
   const b = normalizePosix(base);
   const t = normalizePosix(target);
   if (!b) return t;
   if (t === b) return '';
   return t.startsWith(`${b}/`) ? t.slice(b.length + 1) : t;
}
/** Build a normalized, key-ordered {@link RepoInfo}, dropping empty fields. */
export function makeRepoInfo(input: {
   /** Remote as configured; may be scp-like or relative to `base`. */
   remote?: string;
   /** Outer remote, used to resolve relative submodule urls. */
   base?: string;
   path?: string;
   subpath?: string;
   commit?: string;
   branch?: string;
   submodule?: boolean;
}): RepoInfo {
   const remote = (input.remote ?? '').trim();
   const absolute = remote ? resolveGitUrl(input.base ?? '', remote) : '';
   const url = absolute ? normalizeGitUrl(absolute) : '';
   const info: Record<string, unknown> = {};
   if (url) info.url = url;
   if (remote && remote !== url) info.remote = remote;
   if (url) {
     const host = repoHost(url);
     const slug = repoSlug(url);
     if (host) info.host = host;
     if (slug) info.slug = slug;
   }
   if (input.path) info.path = normalizePosix(input.path);
   if (input.subpath) info.subpath = normalizePosix(input.subpath);
   if (input.commit) info.commit = input.commit;
   if (input.branch) info.branch = input.branch;
   if (input.submodule) info.submodule = true;
   return orderKeys(info, REPO_KEY_ORDER) as RepoInfo;
}
/** Coerce the `repo` field of an `entry.json` into a {@link RepoInfo}. */
export function normalizeRepoRef(value: RepoInfo | string | undefined): RepoInfo | undefined {
   if (!value) return undefined;
   if (typeof value === 'string') return value.trim() ? makeRepoInfo({ remote: value }) : undefined;
   return orderKeys({ ...value } as Record<string, unknown>, REPO_KEY_ORDER) as RepoInfo;
}
/** Explicit (hand-authored) fields win over discovered ones. */
export function mergeRepoInfo(explicit?: RepoInfo, discovered?: RepoInfo): RepoInfo | undefined {
   if (!explicit && !discovered) return undefined;
   const merged: Record<string, unknown> = { ...(discovered ?? {}) };
   for (const [key, value] of Object.entries(explicit ?? {})) {
     if (value !== undefined && value !== '') merged[key] = value;
   }
   return Object.keys(merged).length ? (orderKeys(merged, REPO_KEY_ORDER) as RepoInfo) : undefined;
}
/** Best-effort "view this entry's source" link. */
export function repoBrowseUrl(repo?: RepoInfo, subpath?: string): string {
   if (!repo?.url) return '';
   const rel = normalizePosix(subpath ?? repo.subpath ?? '');
   if (!rel) return repo.url;
   const ref = repo.commit || repo.branch || 'HEAD';
   const verb = /bitbucket/i.test(repo.host ?? '') ? 'src' : 'tree';
   return `${repo.url}/${verb}/${ref}/${rel}`;
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
/** Structural validation of an entry's `repo` override. */
export function validateRepoRef(value: unknown, at: (msg: string) => string): string[] {
   if (typeof value === 'string') {
     return value.trim() ? [] : [at('"repo" must be a non-empty remote URL when given as a string')];
   }
   if (typeof value !== 'object' || value === null || Array.isArray(value)) {
     return [at('"repo" must be a remote URL string or an object')];
   }
   const errors: string[] = [];
   const r = value as Record<string, unknown>;
   for (const key of REPO_KEY_ORDER) {
     if (key === 'submodule') continue;
     if (r[key] !== undefined && typeof r[key] !== 'string') {
       errors.push(at(`"repo.${key}" must be a string when present`));
     }
   }
   if (r.submodule !== undefined && typeof r.submodule !== 'boolean') {
     errors.push(at('"repo.submodule" must be a boolean when present'));
   }
   const unknown = Object.keys(r).filter((k) => !REPO_KEY_ORDER.includes(k) && !isMetaKey(k));
   if (unknown.length) errors.push(at(`unknown repo field(s): ${unknown.join(', ')}`));
   return errors;
}

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
    if (e.repo !== undefined) errors.push(...validateRepoRef(e.repo, at));
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
   const { id, category, section, order, dir, source, hidden, tags, repo, ...rest } =
     resolved as ManifestEntry;
   void id; void category; void section; void order; void dir; void source; void hidden; void tags; void repo;
  return orderKeys(rest as Record<string, unknown>, LEGACY_KEY_ORDER);
}