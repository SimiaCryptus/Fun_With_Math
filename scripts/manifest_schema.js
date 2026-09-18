/**
 * manifest_schema.js
 *
 * Runtime (browser) mirror of the isomorphic half of `manifest_schema.ts`.
 * Keep the two in sync — or generate this file with `tsc --target es2020
 * --module es2020 scripts/manifest_schema.ts`. Node-only helpers (`.gitmodules`
 * parsing, legacy manifest emission) are intentionally omitted.
 */

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

export const MANIFEST_VERSION = 2;
export const ENTRY_FILENAME = 'entry.json';
export const MANIFEST_FILENAME = 'manifest.json';

export const CATEGORIES = ['lab', 'game', 'essay'];

export const CATEGORY_ROOTS = {
  lab: 'experiments',
  game: 'games',
  essay: 'essays',
};

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

/** Extra bookkeeping keys that only exist in the unified manifest. */
export const MANIFEST_ONLY_KEYS = ['dir', 'source'];

/** Full key order for an entry as serialized into `manifest.json`. */
export const MANIFEST_ENTRY_KEY_ORDER = [...ENTRY_KEY_ORDER, ...MANIFEST_ONLY_KEYS];

/* ------------------------------------------------------------------ *
 * POSIX path helpers
 * ------------------------------------------------------------------ */

export function isExternal(p) {
  return /^[a-z][a-z0-9+.\-]*:/i.test(p) || p.startsWith('//');
}

export function isRootRelative(p) {
  return p.startsWith('/');
}

export function splitPathSuffix(p) {
  const m = /^([^?#]*)([?#][\s\S]*)?$/.exec(p);
  return [m?.[1] ?? p, m?.[2] ?? ''];
}

export function normalizePosix(p) {
  const abs = String(p ?? '').startsWith('/');
  const out = [];
  for (const part of String(p ?? '').split('/')) {
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
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isMetaKey(key) {
  return key.startsWith('$') || key === '//';
}

/* ------------------------------------------------------------------ *
 * Path <-> entry-directory translation
 * ------------------------------------------------------------------ */

export function toPathRef(dir, value) {
  if (!value) return '';
  if (isExternal(value)) return value;
  const [pathPart, suffix] = splitPathSuffix(value);
  const norm = normalizePosix(pathPart.replace(/^\/+/, ''));
  const prefix = dir ? `${normalizePosix(dir)}/` : '';
  if (prefix && norm.startsWith(prefix)) return norm.slice(prefix.length) + suffix;
  return `/${norm}${suffix}`;
}

export function resolvePathRef(dir, value) {
  if (!value) return '';
  if (isExternal(value)) return value;
  const [pathPart, suffix] = splitPathSuffix(value);
  if (isRootRelative(pathPart)) return normalizePosix(pathPart).replace(/^\/+/, '') + suffix;
  return joinPosix(dir, pathPart) + suffix;
}

export function resolveEntryPaths(entry, dir) {
  const out = { ...entry };
  out.href = resolvePathRef(dir, entry.href);
  if (entry.readme !== undefined) out.readme = resolvePathRef(dir, entry.readme);
  if (entry.video !== undefined) out.video = resolvePathRef(dir, entry.video);
  return out;
}

/* ------------------------------------------------------------------ *
 * Git provenance helpers
 * ------------------------------------------------------------------ */

export function normalizeGitUrl(remote) {
  const raw = String(remote ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') || raw.startsWith('.') || /^file:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }
  let url = raw;
  const scp = /^(?:[^@\s/]+@)?([^\s:/]+):([^\s].*)$/.exec(url);
  if (scp && !url.includes('://')) url = `https://${scp[1]}/${scp[2]}`;
  url = url.replace(/^(?:ssh|git|git\+ssh|git\+https):\/\//i, 'https://');
  url = url.replace(/^(https?:\/\/)[^/@]+@/i, '$1');
  url = url.replace(/\/+$/, '').replace(/\.git$/i, '');
  return url;
}

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

export function repoSlug(url) {
  const m = /^[a-z][a-z0-9+.\-]*:\/\/[^/]+\/(.+)$/i.exec(url);
  if (!m) return '';
  return m[1].replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
}

export function makeRepoInfo(input = {}) {
  const remote = String(input.remote ?? '').trim();
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

export function normalizeRepoRef(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return value.trim() ? makeRepoInfo({ remote: value }) : undefined;
  return orderKeys({ ...value }, REPO_KEY_ORDER);
}

export function mergeRepoInfo(explicit, discovered) {
  if (!explicit && !discovered) return undefined;
  const merged = { ...(discovered ?? {}) };
  for (const [key, value] of Object.entries(explicit ?? {})) {
    if (value !== undefined && value !== '') merged[key] = value;
  }
  return Object.keys(merged).length ? orderKeys(merged, REPO_KEY_ORDER) : undefined;
}

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

export function uniqueId(base, taken) {
  const seed = slugify(base) || 'entry';
  if (!taken.has(seed)) return seed;
  let n = 2;
  while (taken.has(`${seed}-${n}`)) n += 1;
  return `${seed}-${n}`;
}

export function defaultSection(category) {
  return LEGACY_SOURCES.find((s) => s.category === category)?.defaultSection ?? 'featured';
}

export function knownSections(category) {
  return LEGACY_SOURCES.find((s) => s.category === category)?.sections ?? [];
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
    String(a.section ?? '').localeCompare(String(b.section ?? '')) ||
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
    String(a.title ?? '').localeCompare(String(b.title ?? '')) ||
    String(a.id ?? '').localeCompare(String(b.id ?? ''))
  );
}

/* ------------------------------------------------------------------ *
 * Validation & serialization
 * ------------------------------------------------------------------ */

const REQUIRED_STRINGS = ['id', 'icon', 'title', 'href'];
const OPTIONAL_STRINGS = ['section', 'subtitle', 'readme', 'video', 'launchLabel', 'pitch'];

/** Fields that must survive as empty strings so validation can flag them. */
export const REQUIRED_KEYS = new Set([...REQUIRED_STRINGS, 'category']);

export function validateRepoRef(value, at) {
  if (typeof value === 'string') {
    return value.trim() ? [] : [at('"repo" must be a non-empty remote URL when given as a string')];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [at('"repo" must be a remote URL string or an object')];
  }
  const errors = [];
  for (const key of REPO_KEY_ORDER) {
    if (key === 'submodule') continue;
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      errors.push(at(`"repo.${key}" must be a string when present`));
    }
  }
  if (value.submodule !== undefined && typeof value.submodule !== 'boolean') {
    errors.push(at('"repo.submodule" must be a boolean when present'));
  }
  const unknown = Object.keys(value).filter((k) => !REPO_KEY_ORDER.includes(k) && !isMetaKey(k));
  if (unknown.length) errors.push(at(`unknown repo field(s): ${unknown.join(', ')}`));
  return errors;
}

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

/** Validate a full unified manifest entry (adds `dir` / `source` checks). */
export function validateManifestEntry(entry, source = '<memory>') {
  const { dir, source: src, ...rest } = entry ?? {};
  const errors = validateEntryFile(rest, source);
  if (typeof dir !== 'string' || !dir.trim()) errors.push(`${source}: missing or empty "dir"`);
  if (typeof src !== 'string' || !src.trim()) errors.push(`${source}: missing or empty "source"`);
  return errors;
}

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
