'use strict';
/**
 * manifest/schema.ts
 *
 * Single source of truth for the unified content manifest.
 *
 * This module is deliberately dependency-free and isomorphic: it contains no
 * `node:` imports and only POSIX-style string path math, so it can be imported
 * by the build scripts, by a bundler, or directly by the site at runtime.
 */
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
var __rest =
  (this && this.__rest) ||
  function (s, e) {
    var t = {};
    for (var p in s)
      if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === 'function')
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t[p[i]] = s[p[i]];
      }
    return t;
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.REPO_KEY_ORDER =
  exports.LEGACY_KEY_ORDER =
  exports.ENTRY_KEY_ORDER =
  exports.LEGACY_SOURCES =
  exports.SCAN_MAX_DEPTH =
  exports.SCAN_IGNORE =
  exports.SCAN_ROOTS =
  exports.CATEGORY_ROOTS =
  exports.CATEGORIES =
  exports.MANIFEST_FILENAME =
  exports.ENTRY_FILENAME =
  exports.MANIFEST_VERSION =
    void 0;
exports.isExternal = isExternal;
exports.isRootRelative = isRootRelative;
exports.splitPathSuffix = splitPathSuffix;
exports.normalizePosix = normalizePosix;
exports.joinPosix = joinPosix;
exports.dirnamePosix = dirnamePosix;
exports.basenamePosix = basenamePosix;
exports.slugify = slugify;
exports.isMetaKey = isMetaKey;
exports.toPathRef = toPathRef;
exports.resolvePathRef = resolvePathRef;
exports.resolveEntryPaths = resolveEntryPaths;
exports.normalizeGitUrl = normalizeGitUrl;
exports.resolveGitUrl = resolveGitUrl;
exports.repoHost = repoHost;
exports.repoSlug = repoSlug;
exports.parseGitmodules = parseGitmodules;
exports.parseSubmoduleStatus = parseSubmoduleStatus;
exports.matchRepoPath = matchRepoPath;
exports.relativeUnder = relativeUnder;
exports.makeRepoInfo = makeRepoInfo;
exports.normalizeRepoRef = normalizeRepoRef;
exports.mergeRepoInfo = mergeRepoInfo;
exports.repoBrowseUrl = repoBrowseUrl;
exports.entryDirFor = entryDirFor;
exports.entryIdFromDir = entryIdFromDir;
exports.uniqueId = uniqueId;
exports.categoryRank = categoryRank;
exports.sectionRank = sectionRank;
exports.compareEntries = compareEntries;
exports.validateRepoRef = validateRepoRef;
exports.validateEntryFile = validateEntryFile;
exports.orderKeys = orderKeys;
exports.serializeJson = serializeJson;
exports.toLegacyEntry = toLegacyEntry;
/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */
/** Bumped to 2 when entries gained the autodiscovered `repo` block. */
exports.MANIFEST_VERSION = 2;
/** Filename of the per-directory sidecar written by `split-manifest`. */
exports.ENTRY_FILENAME = 'entry.json';
/** Filename of the unified manifest written by `build-manifest`. */
exports.MANIFEST_FILENAME = 'manifest.json';
exports.CATEGORIES = ['lab', 'game', 'essay'];
/** Where new entries of each category live by default. */
exports.CATEGORY_ROOTS = {
  lab: 'experiments',
  game: 'games',
  essay: 'essays',
};
/** Directories the builder scans for `entry.json` sidecars. */
exports.SCAN_ROOTS = ['experiments', 'games', 'essays'];
/** Never descend into these while scanning. */
exports.SCAN_IGNORE = ['node_modules', '.git', '.idea', 'dist', 'build', 'vendor', 'assets'];
/** How deep below a scan root an `entry.json` may live. */
exports.SCAN_MAX_DEPTH = 4;
/**
 * The three manifests being unified. Also used in reverse by
 * `build-manifest --legacy` to regenerate them for backwards compatibility.
 */
exports.LEGACY_SOURCES = [
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
exports.ENTRY_KEY_ORDER = [
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
exports.LEGACY_KEY_ORDER = [
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
exports.REPO_KEY_ORDER = [
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
function isExternal(p) {
  return /^[a-z][a-z0-9+.\-]*:/i.test(p) || p.startsWith('//');
}
function isRootRelative(p) {
  return p.startsWith('/');
}
/** Split `path?query#hash` into `[path, suffix]`. */
function splitPathSuffix(p) {
  var _a, _b;
  // `[\s\S]` so a stray newline in a query/hash does not silently truncate.
  var m = /^([^?#]*)([?#][\s\S]*)?$/.exec(p);
  return [
    (_a = m === null || m === void 0 ? void 0 : m[1]) !== null && _a !== void 0 ? _a : p,
    (_b = m === null || m === void 0 ? void 0 : m[2]) !== null && _b !== void 0 ? _b : '',
  ];
}
function normalizePosix(p) {
  var abs = p.startsWith('/');
  var out = [];
  for (var _i = 0, _a = p.split('/'); _i < _a.length; _i++) {
    var part = _a[_i];
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
function joinPosix() {
  var parts = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    parts[_i] = arguments[_i];
  }
  return normalizePosix(parts.filter(Boolean).join('/'));
}
function dirnamePosix(p) {
  var i = p.lastIndexOf('/');
  if (i < 0) return '';
  if (i === 0) return '/';
  return p.slice(0, i);
}
function basenamePosix(p) {
  var i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}
function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
/** Keys that carry comments/metadata rather than content (`$schema`, `//`). */
function isMetaKey(key) {
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
function toPathRef(dir, value) {
  // An empty reference stays empty: callers must decide whether that is fatal.
  // (Previously this produced a bare "/", which then passed validation.)
  if (!value) return '';
  if (isExternal(value)) return value;
  var _a = splitPathSuffix(value),
    pathPart = _a[0],
    suffix = _a[1];
  var norm = normalizePosix(pathPart.replace(/^\/+/, ''));
  var prefix = dir ? ''.concat(normalizePosix(dir), '/') : '';
  if (prefix && norm.startsWith(prefix)) return norm.slice(prefix.length) + suffix;
  return '/'.concat(norm).concat(suffix);
}
/** Inverse of {@link toPathRef}: produce a root-relative path (or URL). */
function resolvePathRef(dir, value) {
  if (isExternal(value)) return value;
  var _a = splitPathSuffix(value),
    pathPart = _a[0],
    suffix = _a[1];
  if (isRootRelative(pathPart)) return normalizePosix(pathPart).replace(/^\/+/, '') + suffix;
  return joinPosix(dir, pathPart) + suffix;
}
/** Resolve every path field of an entry against its directory, in place-safe fashion. */
function resolveEntryPaths(entry, dir) {
  var out = __assign({}, entry);
  out.href = resolvePathRef(dir, entry.href);
  if (entry.readme !== undefined) out.readme = resolvePathRef(dir, entry.readme);
  if (entry.video !== undefined) out.video = resolvePathRef(dir, entry.video);
  return out;
}
/* ------------------------------------------------------------------ *
 * Git repository discovery (pure string helpers, no `node:` imports)
 * ------------------------------------------------------------------ */
/** Turn any remote spelling into a canonical, browsable https URL. */
function normalizeGitUrl(remote) {
  var raw = (remote !== null && remote !== void 0 ? remote : '').trim();
  if (!raw) return '';
  // Plain filesystem remotes are left alone: there is nothing to browse.
  if (raw.startsWith('/') || raw.startsWith('.') || /^file:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }
  var url = raw;
  // scp-like shorthand: git@host:owner/name.git
  var scp = /^(?:[^@\s/]+@)?([^\s:/]+):([^\s].*)$/.exec(url);
  if (scp && !url.includes('://')) url = 'https://'.concat(scp[1], '/').concat(scp[2]);
  url = url.replace(/^(?:ssh|git|git\+ssh|git\+https):\/\//i, 'https://');
  url = url.replace(/^(https?:\/\/)[^/@]+@/i, '$1'); // drop embedded credentials
  url = url.replace(/\/+$/, '').replace(/\.git$/i, '');
  return url;
}
/** Resolve a relative submodule url (`../x.git`) against the outer remote. */
function resolveGitUrl(base, ref) {
  var _a;
  if (!/^\.{1,2}\//.test(ref)) return ref;
  var b = normalizeGitUrl(base);
  if (!b) return ref;
  var m = /^([a-z][a-z0-9+.\-]*:\/\/[^/]+)(\/.*)?$/i.exec(b);
  if (!m) return normalizePosix(''.concat(b, '/').concat(ref));
  var joined = normalizePosix(
    ''.concat((_a = m[2]) !== null && _a !== void 0 ? _a : '/', '/').concat(ref)
  );
  return ''.concat(m[1]).concat(joined.startsWith('/') ? joined : '/'.concat(joined));
}
function repoHost(url) {
  var _a, _b;
  return (_b =
    (_a = /^[a-z][a-z0-9+.\-]*:\/\/([^/]+)/i.exec(url)) === null || _a === void 0
      ? void 0
      : _a[1]) !== null && _b !== void 0
    ? _b
    : '';
}
/** `https://github.com/user/project` → `user/project` (nested groups kept). */
function repoSlug(url) {
  var m = /^[a-z][a-z0-9+.\-]*:\/\/[^/]+\/(.+)$/i.exec(url);
  if (!m) return '';
  return m[1].replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
}
/** Parse a `.gitmodules` file. Unknown sections and comments are ignored. */
function parseGitmodules(text) {
  var out = [];
  var cur = null;
  var commit = function () {
    var _a;
    if (cur === null || cur === void 0 ? void 0 : cur.path)
      out.push({
        name: cur.name || cur.path,
        path: cur.path,
        url: (_a = cur.url) !== null && _a !== void 0 ? _a : '',
        branch: cur.branch,
      });
    cur = null;
  };
  for (
    var _i = 0, _a = (text !== null && text !== void 0 ? text : '').split(/\r?\n/);
    _i < _a.length;
    _i++
  ) {
    var line = _a[_i];
    var trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith('[')) {
      commit();
      var section = /^\[submodule\s+"?([^"\]]*)"?\]$/i.exec(trimmed);
      if (section) cur = { name: section[1] };
      continue;
    }
    if (!cur) continue;
    var kv = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!kv) continue;
    var key = kv[1].toLowerCase();
    var value = kv[2].trim().replace(/^"|"$/g, '');
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
function parseSubmoduleStatus(text) {
  var _a;
  var out = [];
  for (
    var _i = 0, _b = (text !== null && text !== void 0 ? text : '').split(/\r?\n/);
    _i < _b.length;
    _i++
  ) {
    var line = _b[_i];
    if (!line.trim()) continue;
    var m = /^([-+U ]?)\s*([0-9a-f]{7,40})\s+(\S+)(?:\s+\((.*)\))?\s*$/i.exec(line);
    if (!m) continue;
    out.push({
      state: m[1] || ' ',
      commit: m[2],
      path: normalizePosix(m[3]),
      ref: (_a = m[4]) === null || _a === void 0 ? void 0 : _a.replace(/^heads\//, ''),
    });
  }
  return out;
}
/** Longest checkout path in `paths` that contains `dir`, or `null`. */
function matchRepoPath(dir, paths) {
  var target = normalizePosix(dir);
  var best = null;
  for (var _i = 0, paths_1 = paths; _i < paths_1.length; _i++) {
    var candidate = paths_1[_i];
    var p = normalizePosix(candidate);
    if (!p) continue;
    if (target === p || target.startsWith(''.concat(p, '/'))) {
      if (!best || p.length > best.length) best = p;
    }
  }
  return best;
}
/** `relativeUnder('games', 'games/wordsearch')` → `'wordsearch'`. */
function relativeUnder(base, target) {
  var b = normalizePosix(base);
  var t = normalizePosix(target);
  if (!b) return t;
  if (t === b) return '';
  return t.startsWith(''.concat(b, '/')) ? t.slice(b.length + 1) : t;
}
/** Build a normalized, key-ordered {@link RepoInfo}, dropping empty fields. */
function makeRepoInfo(input) {
  var _a, _b;
  var remote = ((_a = input.remote) !== null && _a !== void 0 ? _a : '').trim();
  var absolute = remote
    ? resolveGitUrl((_b = input.base) !== null && _b !== void 0 ? _b : '', remote)
    : '';
  var url = absolute ? normalizeGitUrl(absolute) : '';
  var info = {};
  if (url) info.url = url;
  if (remote && remote !== url) info.remote = remote;
  if (url) {
    var host = repoHost(url);
    var slug = repoSlug(url);
    if (host) info.host = host;
    if (slug) info.slug = slug;
  }
  if (input.path) info.path = normalizePosix(input.path);
  if (input.subpath) info.subpath = normalizePosix(input.subpath);
  if (input.commit) info.commit = input.commit;
  if (input.branch) info.branch = input.branch;
  if (input.submodule) info.submodule = true;
  return orderKeys(info, exports.REPO_KEY_ORDER);
}
/** Coerce the `repo` field of an `entry.json` into a {@link RepoInfo}. */
function normalizeRepoRef(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return value.trim() ? makeRepoInfo({ remote: value }) : undefined;
  return orderKeys(__assign({}, value), exports.REPO_KEY_ORDER);
}
/** Explicit (hand-authored) fields win over discovered ones. */
function mergeRepoInfo(explicit, discovered) {
  if (!explicit && !discovered) return undefined;
  var merged = __assign({}, discovered !== null && discovered !== void 0 ? discovered : {});
  for (
    var _i = 0, _a = Object.entries(explicit !== null && explicit !== void 0 ? explicit : {});
    _i < _a.length;
    _i++
  ) {
    var _b = _a[_i],
      key = _b[0],
      value = _b[1];
    if (value !== undefined && value !== '') merged[key] = value;
  }
  return Object.keys(merged).length ? orderKeys(merged, exports.REPO_KEY_ORDER) : undefined;
}
/** Best-effort "view this entry's source" link. */
function repoBrowseUrl(repo, subpath) {
  var _a, _b;
  if (!(repo === null || repo === void 0 ? void 0 : repo.url)) return '';
  var rel = normalizePosix(
    (_a = subpath !== null && subpath !== void 0 ? subpath : repo.subpath) !== null && _a !== void 0
      ? _a
      : ''
  );
  if (!rel) return repo.url;
  var ref = repo.commit || repo.branch || 'HEAD';
  var verb = /bitbucket/i.test((_b = repo.host) !== null && _b !== void 0 ? _b : '')
    ? 'src'
    : 'tree';
  return ''.concat(repo.url, '/').concat(verb, '/').concat(ref, '/').concat(rel);
}
/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */
/** Pick the directory that should own an entry, given its (root-relative) paths. */
function entryDirFor(input) {
  var localDir = function (p) {
    if (!p || isExternal(p)) return '';
    var pathPart = splitPathSuffix(p)[0];
    var dir = dirnamePosix(normalizePosix(pathPart.replace(/^\/+/, '')));
    return dir === '/' ? '' : dir;
  };
  return (
    localDir(input.href) ||
    localDir(input.readme) ||
    joinPosix(exports.CATEGORY_ROOTS[input.category], slugify(input.title))
  );
}
function entryIdFromDir(dir, fallbackTitle) {
  if (fallbackTitle === void 0) {
    fallbackTitle = '';
  }
  return slugify(basenamePosix(dir)) || slugify(fallbackTitle) || 'entry';
}
/**
 * Return `base` (slugified) if free, otherwise `base-2`, `base-3`, … so the
 * result is guaranteed absent from `taken`.
 */
function uniqueId(base, taken) {
  var seed = slugify(base) || 'entry';
  if (!taken.has(seed)) return seed;
  var n = 2;
  while (taken.has(''.concat(seed, '-').concat(n))) n += 1;
  return ''.concat(seed, '-').concat(n);
}
/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */
function categoryRank(category) {
  var i = exports.CATEGORIES.indexOf(category);
  return i < 0 ? exports.CATEGORIES.length : i;
}
function sectionRank(category, section) {
  var src = exports.LEGACY_SOURCES.find(function (s) {
    return s.category === category;
  });
  var i = src ? src.sections.indexOf(section) : -1;
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}
function compareEntries(a, b) {
  var _a, _b;
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    sectionRank(a.category, a.section) - sectionRank(b.category, b.section) ||
    a.section.localeCompare(b.section) ||
    ((_a = a.order) !== null && _a !== void 0 ? _a : Number.MAX_SAFE_INTEGER) -
      ((_b = b.order) !== null && _b !== void 0 ? _b : Number.MAX_SAFE_INTEGER) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}
/* ------------------------------------------------------------------ *
 * Validation & serialization
 * ------------------------------------------------------------------ */
var REQUIRED_STRINGS = ['id', 'icon', 'title', 'href'];
var OPTIONAL_STRINGS = ['section', 'subtitle', 'readme', 'video', 'launchLabel', 'pitch'];
/** Structural validation of an entry's `repo` override. */
function validateRepoRef(value, at) {
  if (typeof value === 'string') {
    return value.trim() ? [] : [at('"repo" must be a non-empty remote URL when given as a string')];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [at('"repo" must be a remote URL string or an object')];
  }
  var errors = [];
  var r = value;
  for (var _i = 0, REPO_KEY_ORDER_1 = exports.REPO_KEY_ORDER; _i < REPO_KEY_ORDER_1.length; _i++) {
    var key = REPO_KEY_ORDER_1[_i];
    if (key === 'submodule') continue;
    if (r[key] !== undefined && typeof r[key] !== 'string') {
      errors.push(at('"repo.'.concat(key, '" must be a string when present')));
    }
  }
  if (r.submodule !== undefined && typeof r.submodule !== 'boolean') {
    errors.push(at('"repo.submodule" must be a boolean when present'));
  }
  var unknown = Object.keys(r).filter(function (k) {
    return !exports.REPO_KEY_ORDER.includes(k) && !isMetaKey(k);
  });
  if (unknown.length) errors.push(at('unknown repo field(s): '.concat(unknown.join(', '))));
  return errors;
}
/** Structural validation. Returns a list of human-readable problems. */
function validateEntryFile(raw, source) {
  if (source === void 0) {
    source = '<memory>';
  }
  var errors = [];
  var at = function (msg) {
    return ''.concat(source, ': ').concat(msg);
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return [at('expected a JSON object')];
  }
  var e = raw;
  for (var _i = 0, REQUIRED_STRINGS_1 = REQUIRED_STRINGS; _i < REQUIRED_STRINGS_1.length; _i++) {
    var key = REQUIRED_STRINGS_1[_i];
    if (typeof e[key] !== 'string' || !e[key].trim()) {
      errors.push(at('missing or empty required string field "'.concat(key, '"')));
    }
  }
  if (typeof e.category !== 'string' || !exports.CATEGORIES.includes(e.category)) {
    errors.push(at('"category" must be one of '.concat(exports.CATEGORIES.join(' | '))));
  }
  for (var _a = 0, OPTIONAL_STRINGS_1 = OPTIONAL_STRINGS; _a < OPTIONAL_STRINGS_1.length; _a++) {
    var key = OPTIONAL_STRINGS_1[_a];
    if (e[key] !== undefined && typeof e[key] !== 'string') {
      errors.push(at('"'.concat(key, '" must be a string when present')));
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
    (!Array.isArray(e.tags) ||
      e.tags.some(function (t) {
        return typeof t !== 'string';
      }))
  ) {
    errors.push(at('"tags" must be an array of strings when present'));
  }
  if (typeof e.id === 'string' && e.id !== slugify(e.id)) {
    errors.push(
      at('"id" must be a slug (got "'.concat(e.id, '", expected "').concat(slugify(e.id), '")'))
    );
  }
  if (typeof e.href === 'string' && (e.href.trim() === '/' || e.href.trim() === '.')) {
    errors.push(at('"href" must point at a file, not a bare directory root'));
  }
  if (e.repo !== undefined) errors.push.apply(errors, validateRepoRef(e.repo, at));
  var unknown = Object.keys(e).filter(function (k) {
    return !exports.ENTRY_KEY_ORDER.includes(k) && !isMetaKey(k);
  });
  if (unknown.length) errors.push(at('unknown field(s): '.concat(unknown.join(', '))));
  return errors;
}
/** Re-key an object into a canonical order, dropping `undefined` values. */
function orderKeys(obj, order) {
  var out = {};
  for (var _i = 0, order_1 = order; _i < order_1.length; _i++) {
    var key = order_1[_i];
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  for (var _a = 0, _b = Object.keys(obj); _a < _b.length; _a++) {
    var key = _b[_a];
    if (!(key in out) && obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}
function serializeJson(value) {
  return ''.concat(JSON.stringify(value, null, 2), '\n');
}
/** Strip the manifest-only bookkeeping fields for legacy consumers. */
function toLegacyEntry(entry) {
  var resolved = resolveEntryPaths(entry, entry.dir);
  var _a = resolved,
    id = _a.id,
    category = _a.category,
    section = _a.section,
    order = _a.order,
    dir = _a.dir,
    source = _a.source,
    hidden = _a.hidden,
    tags = _a.tags,
    repo = _a.repo,
    rest = __rest(_a, [
      'id',
      'category',
      'section',
      'order',
      'dir',
      'source',
      'hidden',
      'tags',
      'repo',
    ]);
  void id;
  void category;
  void section;
  void order;
  void dir;
  void source;
  void hidden;
  void tags;
  void repo;
  return orderKeys(rest, exports.LEGACY_KEY_ORDER);
}
