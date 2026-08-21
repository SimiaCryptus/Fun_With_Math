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
export const MANIFEST_VERSION = 1;
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
export const SCAN_IGNORE = [
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
/**
 * The three manifests being unified. Also used in reverse by
 * `build-manifest --legacy` to regenerate them for backwards compatibility.
 */
export const LEGACY_SOURCES = [
    { file: 'labs.json', category: 'lab', sections: ['featured', 'essays', 'demos'], defaultSection: 'featured' },
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
        if (!part || part === '.')
            continue;
        if (part === '..') {
            if (out.length && out[out.length - 1] !== '..')
                out.pop();
            else if (!abs)
                out.push('..');
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
    if (i < 0)
        return '';
    if (i === 0)
        return '/';
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
    if (!value)
        return '';
    if (isExternal(value))
        return value;
    const [pathPart, suffix] = splitPathSuffix(value);
    const norm = normalizePosix(pathPart.replace(/^\/+/, ''));
    const prefix = dir ? `${normalizePosix(dir)}/` : '';
    if (prefix && norm.startsWith(prefix))
        return norm.slice(prefix.length) + suffix;
    return `/${norm}${suffix}`;
}
/** Inverse of {@link toPathRef}: produce a root-relative path (or URL). */
export function resolvePathRef(dir, value) {
    if (isExternal(value))
        return value;
    const [pathPart, suffix] = splitPathSuffix(value);
    if (isRootRelative(pathPart))
        return normalizePosix(pathPart).replace(/^\/+/, '') + suffix;
    return joinPosix(dir, pathPart) + suffix;
}
/** Resolve every path field of an entry against its directory, in place-safe fashion. */
export function resolveEntryPaths(entry, dir) {
    const out = { ...entry };
    out.href = resolvePathRef(dir, entry.href);
    if (entry.readme !== undefined)
        out.readme = resolvePathRef(dir, entry.readme);
    if (entry.video !== undefined)
        out.video = resolvePathRef(dir, entry.video);
    return out;
}
/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */
/** Pick the directory that should own an entry, given its (root-relative) paths. */
export function entryDirFor(input) {
    const localDir = (p) => {
        if (!p || isExternal(p))
            return '';
        const [pathPart] = splitPathSuffix(p);
        const dir = dirnamePosix(normalizePosix(pathPart.replace(/^\/+/, '')));
        return dir === '/' ? '' : dir;
    };
    return (localDir(input.href) ||
        localDir(input.readme) ||
        joinPosix(CATEGORY_ROOTS[input.category], slugify(input.title)));
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
    if (!taken.has(seed))
        return seed;
    let n = 2;
    while (taken.has(`${seed}-${n}`))
        n += 1;
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
    return (categoryRank(a.category) - categoryRank(b.category) ||
        sectionRank(a.category, a.section) - sectionRank(b.category, b.section) ||
        a.section.localeCompare(b.section) ||
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id));
}
/* ------------------------------------------------------------------ *
 * Validation & serialization
 * ------------------------------------------------------------------ */
const REQUIRED_STRINGS = ['id', 'icon', 'title', 'href'];
const OPTIONAL_STRINGS = ['section', 'subtitle', 'readme', 'video', 'launchLabel', 'pitch'];
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
    if (unknown.length)
        errors.push(at(`unknown field(s): ${unknown.join(', ')}`));
    return errors;
}
/** Re-key an object into a canonical order, dropping `undefined` values. */
export function orderKeys(obj, order) {
    const out = {};
    for (const key of order)
        if (obj[key] !== undefined)
            out[key] = obj[key];
    for (const key of Object.keys(obj))
        if (!(key in out) && obj[key] !== undefined)
            out[key] = obj[key];
    return out;
}
export function serializeJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
/** Strip the manifest-only bookkeeping fields for legacy consumers. */
export function toLegacyEntry(entry) {
    const resolved = resolveEntryPaths(entry, entry.dir);
    const { id, category, section, order, dir, source, hidden, tags, ...rest } = resolved;
    void id;
    void category;
    void section;
    void order;
    void dir;
    void source;
    void hidden;
    void tags;
    return orderKeys(rest, LEGACY_KEY_ORDER);
}
