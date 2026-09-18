/**
 * scripts/manifest_schema.ts
 *
 * Shared types, constants and helpers for the manifest / entry-sidecar
 * pipeline (build-manifest, sync-entries, split-manifest, apply-seo, …).
 *
 * The repository keeps two representations of the same data:
 *
 *   - `entry.json` sidecars — one per project directory, hand-edited,
 *     the *source of truth*. Path-like fields (`href`, `readme`, `video`)
 *     are written relative to the sidecar's own directory. A leading
 *     "/" pins a reference at the repo root instead (e.g. to point at a
 *     shared asset that lives outside the entry's own directory).
 *
 *   - `manifest.json` — the compiled, flattened view used at runtime.
 *     Every entry carries its `dir` (repo-root-relative, POSIX) and an
 *     optional `source` (repo-root-relative path to the sidecar, for
 *     entries whose sidecar isn't at `<dir>/entry.json`).
 *
 * `build-manifest` walks the tree, reads every sidecar and produces
 * `manifest.json`. `sync-entries` is the inverse: it takes the compiled
 * manifest and writes every entry back into its sidecar. Round-tripping
 * through both must be a fixed point — that's what `--check` verifies.
 */

import path from 'node:path';

/* ------------------------------------------------------------ constants */

export const ENTRY_FILENAME = 'entry.json';
export const MANIFEST_FILENAME = 'manifest.json';

/**
 * Canonical key order used when serializing both `entry.json` sidecars
 * and manifest entries, so that diffs stay minimal and human-reviewable.
 * Keys not listed here are appended afterwards, in their original order.
 */
export const ENTRY_KEY_ORDER = [
    'id',
    'title',
    'description',
     // Deprecated alias for `description`; listed so legacy sidecars that
     // still carry it round-trip with a stable key order.
     'pitch',
    'tags',
    'category',
    'href',
    'readme',
    'video',
    'thumbnail',
    'author',
    'license',
    'date',
    'order',
    'repo',
    'seo',
] as const;
/**
   * Fields that are still read for backwards compatibility but should no longer
   * be authored. Each maps to its modern replacement.
   */
export const DEPRECATED_KEYS: Readonly<Record<string, string>> = {
      pitch: 'description',
};
export const MANIFEST_VERSION = 1;
/**
  * Categories recognised by the legacy per-section JSON exports. Entries may
  * use other `category` values freely; only these participate in `--legacy`
  * output.
  */
export type Category = 'labs' | 'games' | 'essays';
/** One `--legacy` output file and the section(s) it is split into. */
export interface LegacySource {
     category: Category;
     file: string;
     sections: readonly string[];
     defaultSection: string;
}
export const LEGACY_SOURCES: readonly LegacySource[] = [
     {category: 'labs', file: 'labs.json', sections: ['labs'], defaultSection: 'labs'},
     {category: 'games', file: 'games.json', sections: ['games'], defaultSection: 'games'},
     {category: 'essays', file: 'essays.json', sections: ['essays'], defaultSection: 'essays'},
];
/**
  * Default scan configuration for `build-manifest`'s directory walk.
  * `SCAN_ROOTS` is only consulted with `--scan-roots-only`; by default the
  * walk starts at the repository root instead.
  */
export const SCAN_ROOTS: readonly string[] = ['labs', 'games', 'essays'];
/** Directory names always skipped while walking, regardless of scan root. */
export const SCAN_IGNORE: readonly string[] = ['.git'];
/** Default recursion limit (relative to each scan root) for the directory walk. */
export const SCAN_MAX_DEPTH = 3;


/* ---------------------------------------------------------------- types */

export interface RepoInfo {
    url?: string;
    branch?: string;
    commit?: string;

    [key: string]: unknown;
}

/** Shape of a per-directory `entry.json` sidecar file. */
export interface EntryFile {
    id: string;
    title?: string;
    description?: string;
     /** @deprecated legacy alias for {@link EntryFile.description}. */
     pitch?: string;
    tags?: string[];
    category?: string;
    href?: string;
    readme?: string;
    video?: string;
    thumbnail?: string;
    author?: string;
    license?: string;
    date?: string;
    order?: number;
    /** Autodiscovered on build; not normally hand-maintained. */
    repo?: RepoInfo;
    seo?: Record<string, unknown>;

    [key: string]: unknown;
}

/** Shape of one entry inside the compiled `manifest.json`. */
export interface ManifestEntry extends EntryFile {
    /** Repo-root-relative directory the sidecar lives in. */
    dir?: string;
    /** Repo-root-relative path to the sidecar, if not `<dir>/entry.json`. */
    source?: string;
}

export interface UnifiedManifest {
    generatedAt?: string;
    entries: ManifestEntry[];

    [key: string]: unknown;
}
/** One `[submodule "name"]` block parsed out of `.gitmodules`. */
export interface GitmoduleEntry {
     path: string;
     url: string;
     /** Literal `.` means "track the superproject's current branch". */
     branch?: string;
}
/** One line of `git submodule status [--recursive]` output. */
export interface SubmoduleStatus {
     path: string;
     commit: string;
     /** ` ` = in sync, `-` = not initialized, `+` = checked out commit differs, `U` = merge conflicts. */
     state: ' ' | '-' | '+' | 'U';
}


/* ---------------------------------------------------------- path refs */

/**
 * Resolve a path reference found in an `entry.json` (or manifest entry)
 * into a repo-root-relative, slash-free-leading POSIX path.
 *
 *   - a leading "/" pins the reference at the repo root: `/a/b.png` -> `a/b.png`
 *   - anything else is taken relative to `dir`: `b.png` (dir=`a`) -> `a/b.png`
 */
export function resolvePathRef(dir: string, ref: string): string {
    if (ref.startsWith('/')) {
        return path.posix.normalize(ref.slice(1)).replace(/^(\.\.(\/|$))+/, '');
    }
    const base = dir ? `${dir}/${ref}` : ref;
    return path.posix.normalize(base);
}
/**
* Split a path-like reference into its filesystem path and any trailing
* `#fragment` or `?query` suffix, e.g. `"a/b.html#top"` ->
* `["a/b.html", "#top"]`. Useful because `href`/`video` values may point at
* a specific in-page anchor that shouldn't be treated as part of the path
* when resolving or checking the target file on disk.
*/
export function splitPathSuffix(ref: string): [string, string] {
    const match = /^([^?#]*)([?#].*)?$/.exec(ref);
    if (!match) return [ref, ''];
    return [match[1], match[2] ?? ''];
}


/**
 * Inverse of {@link resolvePathRef}: turn a repo-root-relative path back
 * into the reference form appropriate for a sidecar living in `dir`.
 * Paths inside `dir` are written as bare relative paths; anything that
 * would need to climb out of `dir` is instead pinned at the repo root
 * with a leading "/".
 */
export function toPathRef(dir: string, resolved: string): string {
    const normalized = path.posix.normalize(resolved);
    const base = dir ? path.posix.normalize(dir) : '.';
    const rel = path.posix.relative(base, normalized);
    if (rel === '') return '.';
    if (!rel.startsWith('..')) return rel;
    return `/${normalized}`;
}

/** Join POSIX path segments and normalize, dropping empty parts. */
export function joinPosix(...parts: string[]): string {
    const filtered = parts.filter((p) => p !== undefined && p !== null && p !== '');
    if (filtered.length === 0) return '';
    return path.posix.normalize(filtered.join('/'));
}
/** Is `ref` an absolute URL (or other non-local scheme) rather than a repo path? */
export function isExternal(ref: string): boolean {
     return /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//');
}
/**
  * Resolve an entry's `href`/`readme`/`video` fields (as found in a sidecar or
  * manifest entry) against `dir`, leaving external URLs untouched.
  */
export function resolveEntryPaths(
     entry: Pick<EntryFile, 'href' | 'readme' | 'video'>,
     dir: string,
): {href?: string; readme?: string; video?: string} {
     const resolve = (ref?: string): string | undefined => {
         if (!ref) return undefined;
         return isExternal(ref) ? ref : resolvePathRef(dir, ref);
     };
     return {
         href: resolve(entry.href),
         readme: resolve(entry.readme),
         video: resolve(entry.video),
     };
}
/* ----------------------------------------------------------------- repo */
/**
  * Which of `submodulePaths` (if any) contains `dir`? Returns the longest
  * matching path, so nested submodules win over their parents.
  */
export function matchRepoPath(dir: string, submodulePaths: string[]): string | undefined {
     let best: string | undefined;
     for (const sub of submodulePaths) {
         if (dir === sub || dir.startsWith(`${sub}/`)) {
             if (best === undefined || sub.length > best.length) best = sub;
         }
     }
     return best;
}
/** `dir`'s path relative to `base`, given `base` is a prefix of `dir`. */
export function relativeUnder(base: string, dir: string): string {
     if (!base) return dir;
     if (dir === base) return '';
     if (dir.startsWith(`${base}/`)) return dir.slice(base.length + 1);
     return dir;
}
/** Normalize a hand-written sidecar `repo` field into a {@link RepoInfo}. */
export function normalizeRepoRef(repo: unknown): RepoInfo | undefined {
     if (typeof repo !== 'object' || repo === null || Array.isArray(repo)) return undefined;
     const out: RepoInfo = {...(repo as Record<string, unknown>)};
     for (const key of Object.keys(out)) {
         if (out[key] === undefined || out[key] === '') delete out[key];
     }
     return Object.keys(out).length ? out : undefined;
}
/** Merge two (possibly absent) {@link RepoInfo} objects; `primary` wins on conflicts. */
export function mergeRepoInfo(primary?: RepoInfo, secondary?: RepoInfo): RepoInfo | undefined {
     if (!primary && !secondary) return undefined;
     return {...secondary, ...primary};
}
function resolveRelativeRemote(remote: string, base: string): string {
     const parts = base.replace(/\/+$/, '').split('/');
     for (const segment of remote.split('/')) {
         if (segment === '' || segment === '.') continue;
         if (segment === '..') parts.pop();
         else parts.push(segment);
     }
     return parts.join('/');
}
interface MakeRepoInfoOptions {
     remote?: string;
     /** Superproject remote URL, used to resolve relative submodule URLs. */
     base?: string;
     path?: string;
     commit?: string;
     branch?: string;
     submodule?: boolean;
}
/** Build a {@link RepoInfo}, resolving relative submodule URLs against `base`. */
export function makeRepoInfo(opts: MakeRepoInfoOptions): RepoInfo {
     const info: RepoInfo = {};
     if (opts.remote) {
         info.url =
             opts.base && (opts.remote.startsWith('./') || opts.remote.startsWith('../'))
                 ? resolveRelativeRemote(opts.remote, opts.base)
                 : opts.remote;
     }
     if (opts.branch) info.branch = opts.branch;
     if (opts.commit) info.commit = opts.commit;
     if (opts.path) info.path = opts.path;
     if (opts.submodule) info.submodule = true;
     return info;
}
/** Parse a `.gitmodules` file into its `[submodule "name"]` entries. */
export function parseGitmodules(text: string): GitmoduleEntry[] {
     const modules: GitmoduleEntry[] = [];
     let current: Partial<GitmoduleEntry> | null = null;
     const flush = () => {
         if (current?.path && current.url) modules.push(current as GitmoduleEntry);
     };
     for (const rawLine of text.split(/\r?\n/)) {
         const line = rawLine.trim();
         if (/^\[submodule\b/.test(line)) {
             flush();
             current = {};
             continue;
         }
         if (!current) continue;
         const kv = line.match(/^(\w+)\s*=\s*(.*)$/);
         if (!kv) continue;
         const [, key, value] = kv;
         if (key === 'path') current.path = value.trim();
         else if (key === 'url') current.url = value.trim();
         else if (key === 'branch') current.branch = value.trim();
     }
     flush();
     return modules;
}
/** Parse the output of `git submodule status [--recursive]` (or an equivalent file). */
export function parseSubmoduleStatus(text: string): SubmoduleStatus[] {
     const out: SubmoduleStatus[] = [];
     for (const rawLine of text.split(/\r?\n/)) {
         if (!rawLine.trim()) continue;
         const state = rawLine[0];
         const match = rawLine.slice(1).trim().match(/^(\S+)\s+(\S+)/);
         if (!match) continue;
         const [, commit, modPath] = match;
         out.push({
             path: modPath,
             commit,
             state: (state === '-' || state === '+' || state === 'U' ? state : ' ') as SubmoduleStatus['state'],
         });
     }
     return out;
}


/* --------------------------------------------------------------- keys */
/**
  * Preferred prose for an entry: `description`, falling back to the
  * deprecated `pitch` field. Returns `undefined` when neither carries text.
  */
export function entryDescription(
     entry: Pick<EntryFile, 'description' | 'pitch'>,
): string | undefined {
     for (const value of [entry.description, entry.pitch]) {
         if (typeof value === 'string' && value.trim() !== '') return value;
     }
     return undefined;
}
/**
  * Return a copy of `entry` with any legacy `pitch` folded into
  * `description` and the alias removed. An explicit `description` wins.
  */
export function migrateDescription<T extends EntryFile>(entry: T): T {
     if (entry.pitch === undefined) return entry;
     const {pitch, ...rest} = entry as EntryFile;
     const description = entryDescription(entry);
     return orderKeys(
         (description === undefined ? rest : {...rest, description}) as T,
         ENTRY_KEY_ORDER,
     );
}


/**
 * Return a shallow copy of `obj` with keys ordered according to `order`;
 * keys not listed in `order` are appended afterwards, in their original
 * relative order. Keys absent from `obj` are simply skipped.
 */
export function orderKeys<T extends Record<string, unknown>>(
    obj: T,
    order: readonly string[],
): T {
    const out: Record<string, unknown> = {};
    for (const key of order) {
        if (key in obj) out[key] = obj[key];
    }
    for (const key of Object.keys(obj)) {
        if (!(key in out)) out[key] = obj[key];
    }
    return out as T;
}
/* ---------------------------------------------------------------- sort */
/**
  * Ordering used for the compiled manifest: explicit `order` first (entries
  * without one sort last), then title, then id — so ties are stable and
  * deterministic across rebuilds.
  */
export function compareEntries(a: ManifestEntry, b: ManifestEntry): number {
     const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
     const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
     if (orderA !== orderB) return orderA - orderB;
     const titleA = a.title ?? '';
     const titleB = b.title ?? '';
     if (titleA !== titleB) return titleA.localeCompare(titleB);
     return (a.id ?? '').localeCompare(b.id ?? '');
}
/* -------------------------------------------------------------- legacy */
/**
  * Strip manifest-only bookkeeping (`dir`, `source`, `section`, `repo`) from
  * an entry so it matches the shape hand-maintained `labs.json` / `games.json`
  * / `essays.json` files expect.
  */
export function toLegacyEntry(entry: ManifestEntry): Record<string, unknown> {
     const {dir, source, section, repo, category, ...rest} = entry as Record<string, unknown> & {
         dir?: string;
         source?: string;
         section?: string;
         repo?: RepoInfo;
         category?: string;
     };
     return orderKeys(rest, ENTRY_KEY_ORDER);
}


/* ---------------------------------------------------------- serialize */

/** Stable, human-diffable JSON serialization (4-space indent, trailing newline). */
export function serializeJson(value: unknown): string {
    return `${JSON.stringify(value, null, 4)}\n`;
}

/* ---------------------------------------------------------- validate */

/**
 * Minimal structural validation for a would-be `entry.json`. Returns a
 * list of human-readable problems; an empty array means "looks fine".
 * `target` is only used to prefix messages with the file being checked.
 */
export function validateEntryFile(entry: unknown, target: string): string[] {
    const problems: string[] = [];

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return [`${target}: entry must be an object`];
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.id !== 'string' || e.id.trim() === '') {
        problems.push(`${target}: missing or invalid "id"`);
    }
    if (e.title !== undefined && typeof e.title !== 'string') {
        problems.push(`${target}: "title" must be a string`);
    }
    if (e.description !== undefined && typeof e.description !== 'string') {
        problems.push(`${target}: "description" must be a string`);
    }
     if (e.pitch !== undefined) {
         if (typeof e.pitch !== 'string') {
             problems.push(`${target}: "pitch" must be a string`);
         } else if (e.description !== undefined) {
             problems.push(
                 `${target}: "pitch" is deprecated and "description" is already set — remove "pitch"`,
             );
         }
     }
    if (e.tags !== undefined) {
        if (!Array.isArray(e.tags) || e.tags.some((t) => typeof t !== 'string')) {
            problems.push(`${target}: "tags" must be an array of strings`);
        }
    }
    if (e.order !== undefined && typeof e.order !== 'number') {
        problems.push(`${target}: "order" must be a number`);
    }
    for (const field of ['href', 'readme', 'video'] as const) {
        if (e[field] !== undefined && typeof e[field] !== 'string') {
            problems.push(`${target}: "${field}" must be a string`);
        }
    }
    if (e.repo !== undefined && (typeof e.repo !== 'object' || e.repo === null || Array.isArray(e.repo))) {
        problems.push(`${target}: "repo" must be an object`);
    }
    if (e.seo !== undefined && (typeof e.seo !== 'object' || e.seo === null || Array.isArray(e.seo))) {
        problems.push(`${target}: "seo" must be an object`);
    }

    return problems;
}