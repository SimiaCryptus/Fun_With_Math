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
export const MANIFEST_VERSION = 2;
/** Filename of the per-directory sidecar written by `split-manifest`. */
export const ENTRY_FILENAME = 'entry.json';
/** Filename of the unified manifest written by `build-manifest`. */
export const MANIFEST_FILENAME = 'manifest.json';
export const CATEGORIES = ['lab', 'game', 'essay'];
/** Where new entries of each category live by default. */
export const CATEGORY_ROOTS = {
  lab: 'experiments',
  game: 'games',
  essay: 'essays',
};
/** Directories the builder scans for `entry.json` sidecars. */
export const SCAN_ROOTS = ['experiments', 'games', 'essays'];
/** Never descend into these while scanning. */
export const SCAN_IGNORE = ['node_modules', '.git', '.idea', 'dist', 'build', 'vendor', 'assets'];
/** How deep below a scan root an `entry.json` may live. */
export const SCAN_MAX_DEPTH = 4;
/**
 * The three manifests being unified. Also used in reverse by
 * `build-manifest --legacy` to regenerate them for backwards compatibility.
 */
export const LEGACY_SOURCES = [
  {
    file: 'labs.json',
    category: 'lab',
    sections: ['featured', 'essays', 'demos'],
    defaultSection: 'featured',
  },
  { file: 'games.json', category: 'game', sections: ['games'], defaultSection: 'games' },
  { file: 'essays.json', category: 'essay', sections: ['essays'], defaultSection: 'essays' },
];
/** Canonical key order for serialized entries (stable diffs). */
export const ENTRY_KEY_ORDER = [
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
export const LEGACY_KEY_ORDER = [
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
export const REPO_KEY_ORDER = [
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
 * POSIX path helpers (string-only, browser safe)
 * ------------------------------------------------------------------ */
export function isExternal(p) {
  return /^[a-z][a-z0-9+.\-]*:/i.test(p) || p.startsWith('//');
}
export function isRootRelative(p) {
  return p.startsWith('/');
}
/** Split `path?query#hash` into `[path, suffix]`. */
export function splitPathSuffix(p) {
  // `[\s\S]` so a stray newline in a query/hash does not silently truncate.
  const m = /^([^?#]*)([?#][\s\S]*)?$/.exec(p);
  return [m?.[1] ?? p, m?.[2] ?? ''];
}
export function normalizePosix(p) {
  const abs = p.startsWith('/');
  const out = [];
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
export function joinPosix(...parts) {
  return normalizePosix(parts.filter(Boolean).join('/'));
}
export function dirnamePosix(p) {
  const i = p.lastIndexOf('/');
  if (i < 0) return '';
  if (i === 0) return '/';
  return p.slice(0, i);
}
export function basenamePosix(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}
export function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
/** Keys that carry comments/metadata rather than content (`$schema`, `//`). */
export function isMetaKey(key) {
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
export function toPathRef(dir, value) {
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
export function resolvePathRef(dir, value) {
  if (isExternal(value)) return value;
  const [pathPart, suffix] = splitPathSuffix(value);
  if (isRootRelative(pathPart)) return normalizePosix(pathPart).replace(/^\/+/, '') + suffix;
  return joinPosix(dir, pathPart) + suffix;
}
/** Resolve every path field of an entry against its directory, in place-safe fashion. */
export function resolveEntryPaths(entry, dir) {
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
export function normalizeGitUrl(remote) {
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
export function resolveGitUrl(base, ref) {
  if (!/^\.{1,2}\//.test(ref)) return ref;
  const b = normalizeGitUrl(base);
  if (!b) return ref;
  const m = /^([a-z][a-z0-9+.\-]*:\/\/[^/]+)(\/.*)?$/i.exec(b);
  if (!m) return normalizePosix(`${b}/${ref}`);
  const joined = normalizePosix(`${m[2] ?? '/'}/${ref}`);
  return `${m[1]}${joined.startsWith('/') ? joined : `/${joined}`}`;
}
export function repoHost(url) {
  return /^[a-z][a-z0-9+.\-]*:\/\/([^/]+)/i.exec(url)?.[1] ?? '';
}
/** `https://github.com/user/project` → `user/project` (nested groups kept). */
export function repoSlug(url) {
  const m = /^[a-z][a-z0-9+.\-]*:\/\/[^/]+\/(.+)$/i.exec(url);
  if (!m) return '';
  return m[1].replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
}
/** Parse a `.gitmodules` file. Unknown sections and comments are ignored. */
export function parseGitmodules(text) {
  const out = [];
  let cur = null;
  const commit = () => {
    if (cur?.path)
      out.push({
        name: cur.name || cur.path,
        path: cur.path,
        url: cur.url ?? '',
        branch: cur.branch,
      });
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
export function parseSubmoduleStatus(text) {
  const out = [];
  for (const line of (text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^([-+U ]?)\s*([0-9a-f]{7,40})\s+(\S+)(?:\s+\((.*)\))?\s*$/i.exec(line);
    if (!m) continue;
    out.push({
      state: m[1] || ' ',
      commit: m[2],
      path: normalizePosix(m[3]),
      ref: m[4]?.replace(/^heads\//, ''),
    });
  }
  return out;
}
/** Longest checkout path in `paths` that contains `dir`, or `null`. */
export function matchRepoPath(dir, paths) {
  const target = normalizePosix(dir);
  let best = null;
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
export function relativeUnder(base, target) {
  const b = normalizePosix(base);
  const t = normalizePosix(target);
  if (!b) return t;
  if (t === b) return '';
  return t.startsWith(`${b}/`) ? t.slice(b.length + 1) : t;
}
/** Build a normalized, key-ordered {@link RepoInfo}, dropping empty fields. */
export function makeRepoInfo(input) {
  const remote = (input.remote ?? '').trim();
  const absolute = remote ? resolveGitUrl(input.base ?? '', remote) : '';
  const url = absolute ? normalizeGitUrl(absolute) : '';
  const info = {};
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
  return orderKeys(info, REPO_KEY_ORDER);
}
/** Coerce the `repo` field of an `entry.json` into a {@link RepoInfo}. */
export function normalizeRepoRef(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return value.trim() ? makeRepoInfo({ remote: value }) : undefined;
  return orderKeys({ ...value }, REPO_KEY_ORDER);
}
/** Explicit (hand-authored) fields win over discovered ones. */
export function mergeRepoInfo(explicit, discovered) {
  if (!explicit && !discovered) return undefined;
  const merged = { ...(discovered ?? {}) };
  for (const [key, value] of Object.entries(explicit ?? {})) {
    if (value !== undefined && value !== '') merged[key] = value;
  }
  return Object.keys(merged).length ? orderKeys(merged, REPO_KEY_ORDER) : undefined;
}
/** Best-effort "view this entry's source" link. */
export function repoBrowseUrl(repo, subpath) {
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
export function entryDirFor(input) {
  const localDir = (p) => {
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
export function entryIdFromDir(dir, fallbackTitle = '') {
  return slugify(basenamePosix(dir)) || slugify(fallbackTitle) || 'entry';
}
/**
 * Return `base` (slugified) if free, otherwise `base-2`, `base-3`, … so the
 * result is guaranteed absent from `taken`.
 */
export function uniqueId(base, taken) {
  const seed = slugify(base) || 'entry';
  if (!taken.has(seed)) return seed;
  let n = 2;
  while (taken.has(`${seed}-${n}`)) n += 1;
  return `${seed}-${n}`;
}
/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */
export function categoryRank(category) {
  const i = CATEGORIES.indexOf(category);
  return i < 0 ? CATEGORIES.length : i;
}
export function sectionRank(category, section) {
  const src = LEGACY_SOURCES.find((s) => s.category === category);
  const i = src ? src.sections.indexOf(section) : -1;
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}
export function compareEntries(a, b) {
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
const REQUIRED_STRINGS = ['id', 'icon', 'title', 'href'];
const OPTIONAL_STRINGS = ['section', 'subtitle', 'readme', 'video', 'launchLabel', 'pitch'];
/** Structural validation of an entry's `repo` override. */
export function validateRepoRef(value, at) {
  if (typeof value === 'string') {
    return value.trim() ? [] : [at('"repo" must be a non-empty remote URL when given as a string')];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [at('"repo" must be a remote URL string or an object')];
  }
  const errors = [];
  const r = value;
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
export function validateEntryFile(raw, source = '<memory>') {
  const errors = [];
  const at = (msg) => `${source}: ${msg}`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return [at('expected a JSON object')];
  }
  const e = raw;
  for (const key of REQUIRED_STRINGS) {
    if (typeof e[key] !== 'string' || !e[key].trim()) {
      errors.push(at(`missing or empty required string field "${key}"`));
    }
  }
  if (typeof e.category !== 'string' || !CATEGORIES.includes(e.category)) {
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
  if (
    e.tags !== undefined &&
    (!Array.isArray(e.tags) || e.tags.some((t) => typeof t !== 'string'))
  ) {
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
export function orderKeys(obj, order) {
  const out = {};
  for (const key of order) if (obj[key] !== undefined) out[key] = obj[key];
  for (const key of Object.keys(obj))
    if (!(key in out) && obj[key] !== undefined) out[key] = obj[key];
  return out;
}
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
/** Strip the manifest-only bookkeeping fields for legacy consumers. */
export function toLegacyEntry(entry) {
  const resolved = resolveEntryPaths(entry, entry.dir);
  const { id, category, section, order, dir, source, hidden, tags, repo, ...rest } = resolved;
  void id;
  void category;
  void section;
  void order;
  void dir;
  void source;
  void hidden;
  void tags;
  void repo;
  return orderKeys(rest, LEGACY_KEY_ORDER);
}
