/**
 * manifest_editor.js
 *
 * A dependency-free editor for the unified `manifest.json`.
 *
 *   load (fetch | file | paste)  →  edit  →  autosave to localStorage
 *                                          →  copy / download
 *
 * The working copy never touches the server: everything happens in the tab.
 *
 * NOTE: this module is intentionally standalone (no `manifest_schema.js`
 * import) so it can be opened straight from disk; the schema helpers it
 * needs (`orderKeys`, `serializeJson`, validation) are re-exported below.
 */

/* ------------------------------------------------------------------ *
 * Tiny helpers
 * ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const escapeHtml = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Reorder an object's keys: `order` first (when present), then the rest. */
export function orderKeys(obj, order = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const key of order) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  for (const key of Object.keys(obj)) {
    if (!(key in out) && obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

/** Canonical on-disk JSON shape: 2-space indent, trailing newline. */
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

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

const DRAFT_KEY = 'manifest-editor:draft:v2';
const PREFS_KEY = 'manifest-editor:prefs:v1';
const AUTOSAVE_MS = 400;
const DEFAULT_URL = MANIFEST_FILENAME;

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
 * Validation
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

/* ------------------------------------------------------------------ *
 * Manifest shaping
 * ------------------------------------------------------------------ */

function emptyManifest() {
  return {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    counts: {},
    entries: [],
  };
}

/** Accept anything manifest-shaped; throw with a useful message otherwise. */
function coerceManifest(raw) {
  if (Array.isArray(raw)) raw = { entries: raw };
  if (!raw || typeof raw !== 'object') throw new Error('expected a JSON object');
  if (!Array.isArray(raw.entries)) throw new Error('missing "entries" array');
  const bad = raw.entries.findIndex((e) => !e || typeof e !== 'object' || Array.isArray(e));
  if (bad >= 0) throw new Error(`entries[${bad}] is not an object`);
  return {
    version: Number.isFinite(raw.version) ? raw.version : MANIFEST_VERSION,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : new Date().toISOString(),
    counts: raw.counts && typeof raw.counts === 'object' ? { ...raw.counts } : {},
    entries: clone(raw.entries),
  };
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  manifest: emptyManifest(),
  /** The selected entry *object* (identity survives reordering & id edits). */
  selected: null,
  origin: '(empty)',
  savedAt: null,
  rawDirty: false,
  filter: { text: '', category: 'all', hidden: true },
  prefs: { url: DEFAULT_URL, stamp: true, dropHidden: false },
};

/* ------------------------------------------------------------------ *
 * Field definitions (drive both form generation and value round-tripping)
 * ------------------------------------------------------------------ */

const ENTRY_FIELDS = [
  {
    path: 'id',
    label: 'id',
    kind: 'text',
    required: true,
    hint: 'Stable slug, unique across the site',
  },
  { path: 'category', label: 'category', kind: 'select', options: CATEGORIES, required: true },
  { path: 'section', label: 'section', kind: 'text', list: 'sections-list' },
  {
    path: 'order',
    label: 'order',
    kind: 'number',
    hint: 'Sort key within the section; missing sorts last',
  },
  { path: 'icon', label: 'icon', kind: 'text', required: true, hint: '2–3 characters or an emoji' },
  { path: 'title', label: 'title', kind: 'text', required: true },
  { path: 'subtitle', label: 'subtitle', kind: 'text' },
  { path: 'href', label: 'href', kind: 'text', required: true, resolve: true },
  { path: 'readme', label: 'readme', kind: 'text', resolve: true },
  { path: 'video', label: 'video', kind: 'text', resolve: true },
  { path: 'launchLabel', label: 'launchLabel', kind: 'text' },
  {
    path: 'pitch',
    label: 'pitch',
    kind: 'textarea',
    span: true,
    hint: 'Short blurb; inline HTML allowed',
  },
  { path: 'tags', label: 'tags', kind: 'tags', hint: 'Comma-separated' },
  {
    path: 'hidden',
    label: 'hidden',
    kind: 'checkbox',
    hint: 'Excluded from the published manifest',
  },
];

const REPO_FIELDS = REPO_KEY_ORDER.map((key) => ({
  path: `repo.${key}`,
  label: key,
  kind: key === 'submodule' ? 'checkbox' : 'text',
}));

const META_FIELDS = [
  { path: 'dir', label: 'dir', kind: 'text', hint: 'Root-relative directory that owns this entry' },
  {
    path: 'source',
    label: 'source',
    kind: 'text',
    hint: `Root-relative path of the ${ENTRY_FILENAME} sidecar`,
  },
];

/* ------------------------------------------------------------------ *
 * Path get/set on an entry (supports the single-level `repo.` nesting)
 * ------------------------------------------------------------------ */

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  if (!rest.length) {
    const drop =
      value === undefined || value === false || (value === '' && !REQUIRED_KEYS.has(head));
    if (drop) delete obj[head];
    else obj[head] = value;
    return;
  }
  const child =
    obj[head] && typeof obj[head] === 'object' && !Array.isArray(obj[head]) ? obj[head] : {};
  setPath(child, rest.join('.'), value);
  if (Object.keys(child).length) obj[head] = child;
  else delete obj[head];
}

function readControl(el) {
  switch (el.dataset.kind) {
    case 'checkbox':
      return el.checked;
    case 'number': {
      const v = el.value.trim();
      if (!v) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'tags': {
      const list = el.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return list.length ? list : undefined;
    }
    default:
      return el.value;
  }
}

function writeControl(el, value) {
  switch (el.dataset.kind) {
    case 'checkbox':
      el.checked = value === true;
      break;
    case 'tags':
      el.value = Array.isArray(value) ? value.join(', ') : '';
      break;
    case 'number':
      el.value = Number.isFinite(value) ? String(value) : '';
      break;
    default:
      el.value = value == null ? '' : String(value);
  }
}

/* ------------------------------------------------------------------ *
 * DOM references
 * ------------------------------------------------------------------ */

const dom = {
  url: $('#source-url'),
  list: $('#entry-list'),
  form: $('#entry-form'),
  formTitle: $('#form-title'),
  problems: $('#entry-problems'),
  raw: $('#raw'),
  status: $('#status'),
  banner: $('#banner'),
  bannerText: $('#banner-text'),
  toast: $('#toast'),
  file: $('#file-input'),
  filterText: $('#filter-text'),
  filterCategory: $('#filter-category'),
  filterHidden: $('#filter-hidden'),
  prefStamp: $('#pref-stamp'),
  prefDropHidden: $('#pref-drop-hidden'),
};

/* ------------------------------------------------------------------ *
 * Form construction
 * ------------------------------------------------------------------ */

function controlHtml(def) {
  const id = `f-${def.path.replace(/\./g, '-')}`;
  const attrs = `id="${id}" data-path="${escapeHtml(def.path)}" data-kind="${escapeHtml(def.kind)}"`;
  let control;
  switch (def.kind) {
    case 'select':
      control = `<select ${attrs}>${def.options
        .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
        .join('')}</select>`;
      break;
    case 'textarea':
      control = `<textarea ${attrs} rows="5"></textarea>`;
      break;
    case 'checkbox':
      control = `<input type="checkbox" ${attrs}>`;
      break;
    case 'number':
      control = `<input type="number" step="1" ${attrs}>`;
      break;
    default:
      control = `<input type="text" ${attrs} ${def.list ? `list="${escapeHtml(def.list)}"` : ''} spellcheck="false">`;
  }
  return `
    <div class="field${def.span ? ' field--span' : ''}${def.kind === 'checkbox' ? ' field--check' : ''}">
      <label for="${id}">${escapeHtml(def.label)}${def.required ? ' <span class="req">*</span>' : ''}</label>
      ${control}
      ${def.hint ? `<p class="hint">${escapeHtml(def.hint)}</p>` : ''}
      ${def.resolve ? `<p class="hint hint--resolved" data-resolved="${escapeHtml(def.path)}"></p>` : ''}
    </div>`;
}

function fieldsetHtml(legend, defs, extra = '') {
  return `<fieldset><legend>${escapeHtml(legend)}</legend>
    <div class="grid">${defs.map(controlHtml).join('')}</div>${extra}</fieldset>`;
}

function buildForm() {
  dom.form.innerHTML = [
    '<datalist id="sections-list"></datalist>',
    fieldsetHtml('Entry', ENTRY_FIELDS),
    fieldsetHtml(
      'Repository',
      REPO_FIELDS,
      '<p class="hint"><a id="repo-browse" href="#" target="_blank" rel="noopener" hidden></a></p>'
    ),
    fieldsetHtml('Location (written by build-manifest)', META_FIELDS),
  ].join('');
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function visibleEntries() {
  const q = state.filter.text.trim().toLowerCase();
  return state.manifest.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (state.filter.category !== 'all' && entry.category !== state.filter.category) return false;
      if (!state.filter.hidden && entry.hidden) return false;
      if (!q) return true;
      const hay = [entry.id, entry.title, entry.section, entry.href, entry.pitch, entry.repo?.slug]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
}

function renderList() {
  const problems = problemsByEntry();
  const rows = visibleEntries().map(({ entry, index }) => {
    const selected = entry === state.selected ? ' is-selected' : '';
    const bad = problems.get(entry)?.length ? ' is-invalid' : '';
    const order = Number.isFinite(entry.order)
      ? entry.order === Number.MAX_SAFE_INTEGER
        ? '∞'
        : entry.order
      : '—';
    return `<li class="entry${selected}${bad}" data-index="${index}" draggable="true">
      <span class="entry__icon">${escapeHtml(entry.icon ?? '??')}</span>
      <span class="entry__meta">
        <strong>${escapeHtml(entry.title || entry.id || '(untitled)')}</strong>
        <small>${escapeHtml(entry.category ?? '?')} · ${escapeHtml(entry.section ?? '?')} · #${escapeHtml(order)}</small>
      </span>
      ${entry.hidden ? '<span class="tag">hidden</span>' : ''}
    </li>`;
  });
  dom.list.innerHTML = rows.join('') || '<li class="empty">No entries match the filter.</li>';
}

function renderForm() {
  const entry = state.selected;
  dom.form.classList.toggle('is-disabled', !entry);
  dom.formTitle.textContent = entry
    ? `${entry.title || '(untitled)'} — ${entry.id || '(no id)'}`
    : 'No entry selected';

  // Section suggestions.
  const sections = new Set(LEGACY_SOURCES.flatMap((s) => s.sections));
  state.manifest.entries.forEach((e) => e.section && sections.add(e.section));
  const list = $('#sections-list', dom.form);
  if (list) list.innerHTML = [...sections].map((s) => `<option value="${escapeHtml(s)}">`).join('');

  for (const el of $$('[data-path]', dom.form)) {
    el.disabled = !entry;
    writeControl(el, entry ? getPath(entry, el.dataset.path) : undefined);
  }
  for (const el of $$('[data-resolved]', dom.form)) {
    const value = entry ? getPath(entry, el.dataset.resolved) : '';
    el.textContent = value ? `→ ${resolvePathRef(entry?.dir ?? '', value)}` : '';
  }
  const browse = $('#repo-browse', dom.form);
  if (browse) {
    const url = entry ? repoBrowseUrl(entry.repo, entry.repo?.subpath) : '';
    browse.textContent = url ? `open ${url}` : '';
    browse.href = url || '#';
    browse.hidden = !url;
  }
  renderProblems();
}

function renderProblems() {
  const msgs = state.selected ? (problemsByEntry().get(state.selected) ?? []) : [];
  dom.problems.hidden = !msgs.length;
  dom.problems.innerHTML = msgs.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
}

function renderPreview() {
  if (state.rawDirty) return; // don't clobber unapplied hand edits
  dom.raw.value = serializeJson(buildExport({ stamp: false }));
}

function renderStatus() {
  const all = allProblems();
  const saved = state.savedAt ? new Date(state.savedAt).toLocaleTimeString() : 'never';
  const n = state.manifest.entries.length;
  const hidden = state.manifest.entries.filter((e) => e.hidden).length;
  dom.status.innerHTML =
    `<span>${n} entr${n === 1 ? 'y' : 'ies'}${hidden ? ` (${hidden} hidden)` : ''}</span>` +
    `<span>source: ${escapeHtml(state.origin)}</span>` +
    `<span>draft saved: ${escapeHtml(saved)}</span>` +
    (state.rawDirty ? '<span class="status__bad">raw edits not applied</span>' : '') +
    (all.length
      ? `<span class="status__bad">${all.length} problem${all.length === 1 ? '' : 's'}</span>`
      : '<span class="status__ok">valid</span>');
}

function renderAll() {
  renderList();
  renderForm();
  renderPreview();
  renderStatus();
}

/* ------------------------------------------------------------------ *
 * Validation cache
 * ------------------------------------------------------------------ */

let problemCache = null;

function problemsByEntry() {
  if (problemCache) return problemCache;
  const map = new Map();
  const byId = new Map();
  state.manifest.entries.forEach((entry, i) => {
    const label = entry.id || `entries[${i}]`;
    const msgs = validateManifestEntry(entry, label);
    if (entry.id) {
      if (byId.has(entry.id))
        msgs.push(`${label}: duplicate id (also at entries[${byId.get(entry.id)}])`);
      else byId.set(entry.id, i);
    }
    map.set(entry, msgs);
  });
  problemCache = map;
  return map;
}

function allProblems() {
  return [...problemsByEntry().values()].flat();
}

/* ------------------------------------------------------------------ *
 * Mutation plumbing
 * ------------------------------------------------------------------ */

let saveTimer = 0;

/**
 * Single funnel for every mutation: invalidate caches, re-render the
 * requested surfaces, and schedule the localStorage write.
 */
function changed({ list = true, form = true, preview = true } = {}) {
  problemCache = null;
  if (list) renderList();
  if (form) renderForm();
  else renderProblems();
  if (preview) {
    state.rawDirty = false;
    renderPreview();
  }
  renderStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, AUTOSAVE_MS);
}

function setManifest(manifest, origin, { save = true } = {}) {
  state.manifest = manifest;
  state.origin = origin;
  state.selected = manifest.entries[0] ?? null;
  state.rawDirty = false;
  problemCache = null;
  renderAll();
  if (save) saveDraft();
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

function loadPrefs() {
  try {
    Object.assign(state.prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
  } catch {
    /* ignore corrupt prefs */
  }
  dom.url.value = state.prefs.url || DEFAULT_URL;
  dom.prefStamp.checked = state.prefs.stamp !== false;
  dom.prefDropHidden.checked = state.prefs.dropHidden === true;
  dom.filterHidden.checked = state.filter.hidden;
}

function savePrefs() {
  state.prefs.url = dom.url.value.trim() || DEFAULT_URL;
  state.prefs.stamp = dom.prefStamp.checked;
  state.prefs.dropHidden = dom.prefDropHidden.checked;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
  } catch {
    /* quota */
  }
}

function saveDraft() {
  state.savedAt = new Date().toISOString();
  const payload = { v: 1, savedAt: state.savedAt, origin: state.origin, manifest: state.manifest };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch (err) {
    toast(`Could not autosave: ${err.message}`, true);
  }
  renderStatus();
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return { ...payload, manifest: coerceManifest(payload?.manifest) };
  } catch {
    return null;
  }
}

function discardDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
  state.savedAt = null;
}

/* ------------------------------------------------------------------ *
 * Import / export
 * ------------------------------------------------------------------ */

async function loadFromUrl(url, { silent = false } = {}) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setManifest(coerceManifest(await res.json()), url);
    showBanner('');
    if (!silent) toast(`Loaded ${url}`);
  } catch (err) {
    const hint =
      location.protocol === 'file:' ? ' (fetch is blocked on file:// — use Import…)' : '';
    showBanner(`Could not load ${url}: ${err.message}${hint}`);
    if (!silent) toast(`Load failed: ${err.message}`, true);
  }
}

function cleanEntry(entry) {
  const out = clone(entry);
  if (out.repo && typeof out.repo === 'object' && !Array.isArray(out.repo)) {
    out.repo = orderKeys(out.repo, REPO_KEY_ORDER);
  }
  return orderKeys(out, MANIFEST_ENTRY_KEY_ORDER);
}

function buildExport({ stamp = state.prefs.stamp } = {}) {
  const entries = state.manifest.entries
    .filter((e) => !(state.prefs.dropHidden && e.hidden))
    .map(cleanEntry);
  const counts = {};
  for (const e of entries) {
    if (e.hidden) continue;
    counts[e.category] = (counts[e.category] ?? 0) + 1;
  }
  return {
    version: state.manifest.version ?? MANIFEST_VERSION,
    generatedAt: stamp ? new Date().toISOString() : state.manifest.generatedAt,
    counts,
    entries,
  };
}

function exportText() {
  const out = buildExport();
  state.manifest.generatedAt = out.generatedAt;
  state.manifest.counts = out.counts;
  return serializeJson(out);
}

async function copyJson() {
  const text = exportText();
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    toast('Manifest copied to clipboard');
  } catch {
    state.rawDirty = false;
    dom.raw.value = text;
    dom.raw.focus();
    dom.raw.select();
    toast('Clipboard blocked — text selected, press ⌘/Ctrl+C', true);
  }
  changed({ form: false, preview: false });
}

function downloadJson() {
  const url = URL.createObjectURL(new Blob([exportText()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = MANIFEST_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Downloaded ${MANIFEST_FILENAME}`);
  changed({ form: false });
}

/* ------------------------------------------------------------------ *
 * Entry operations
 * ------------------------------------------------------------------ */

function takenIds() {
  return new Set(state.manifest.entries.map((e) => e.id).filter(Boolean));
}

function newEntry() {
  const category =
    state.filter.category !== 'all' ? state.filter.category : (state.selected?.category ?? 'game');
  const id = uniqueId('new-entry', takenIds());
  const dir = joinPosix(CATEGORY_ROOTS[category] ?? '', id);
  const entry = {
    id,
    category,
    section: defaultSection(category),
    order: 0,
    icon: '??',
    title: 'New entry',
    href: 'index.html',
    readme: 'README.md',
    dir,
    source: joinPosix(dir, ENTRY_FILENAME),
  };
  const at = state.selected
    ? state.manifest.entries.indexOf(state.selected) + 1
    : state.manifest.entries.length;
  state.manifest.entries.splice(at, 0, entry);
  state.selected = entry;
  changed();
}

function duplicateEntry() {
  if (!state.selected) return;
  const copy = clone(state.selected);
  copy.id = uniqueId(`${copy.id || 'entry'}-copy`, takenIds());
  copy.title = `${copy.title ?? 'Entry'} (copy)`;
  const at = state.manifest.entries.indexOf(state.selected) + 1;
  state.manifest.entries.splice(at, 0, copy);
  state.selected = copy;
  changed();
}

function deleteEntry() {
  if (!state.selected) return;
  const i = state.manifest.entries.indexOf(state.selected);
  if (i < 0) return;
  if (!confirm(`Delete "${state.selected.title || state.selected.id}"?`)) return;
  state.manifest.entries.splice(i, 1);
  state.selected = state.manifest.entries[Math.min(i, state.manifest.entries.length - 1)] ?? null;
  changed();
}

function moveSelected(delta) {
  const list = state.manifest.entries;
  const i = list.indexOf(state.selected);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  changed({ form: false });
}

function moveByIndex(from, to) {
  const list = state.manifest.entries;
  if (from === to || from < 0 || from >= list.length || to < 0 || to > list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to > from ? to - 1 : to, 0, item);
  changed({ form: false });
}

function sortEntries() {
  state.manifest.entries.sort((a, b) =>
    compareEntries(
      { ...a, section: a.section ?? defaultSection(a.category) },
      { ...b, section: b.section ?? defaultSection(b.category) }
    )
  );
  changed({ form: false });
  toast('Sorted with compareEntries()');
}

function renumber() {
  const seen = new Map();
  for (const entry of state.manifest.entries) {
    const key = `${entry.category}\u0000${entry.section ?? defaultSection(entry.category)}`;
    const n = seen.get(key) ?? 0;
    entry.order = n;
    seen.set(key, n + 1);
  }
  changed({ form: false });
  toast('Renumbered order within each section');
}

function syncPaths() {
  const entry = state.selected;
  if (!entry) return;
  const dir = normalizePosix(
    joinPosix(CATEGORY_ROOTS[entry.category] ?? '', slugify(entry.id || entry.title))
  );
  entry.dir = dir;
  entry.source = joinPosix(dir, ENTRY_FILENAME);
  if (entry.repo && typeof entry.repo === 'object' && !entry.repo.path) entry.repo.path = dir;
  changed();
  toast(`dir → ${dir}`);
}

function normalizeRepo() {
  const entry = state.selected;
  if (!entry?.repo) {
    toast('No repo block on this entry', true);
    return;
  }
  const r = typeof entry.repo === 'string' ? { remote: entry.repo } : entry.repo;
  entry.repo = makeRepoInfo({
    remote: r.remote || r.url || '',
    path: r.path,
    subpath: r.subpath,
    commit: r.commit,
    branch: r.branch,
    submodule: r.submodule,
  });
  if (!Object.keys(entry.repo).length) delete entry.repo;
  changed();
  toast('Repo block normalized');
}

/* ------------------------------------------------------------------ *
 * Event wiring
 * ------------------------------------------------------------------ */

function wire() {
  // --- toolbar -----------------------------------------------------
  $('#btn-load').addEventListener('click', () => {
    savePrefs();
    loadFromUrl(state.prefs.url);
  });
  $('#btn-import').addEventListener('click', () => dom.file.click());
  $('#btn-copy').addEventListener('click', copyJson);
  $('#btn-download').addEventListener('click', downloadJson);
  dom.url.addEventListener('change', savePrefs);
  dom.prefStamp.addEventListener('change', () => {
    savePrefs();
    renderPreview();
  });
  dom.prefDropHidden.addEventListener('change', () => {
    savePrefs();
    renderPreview();
  });

  dom.file.addEventListener('change', async () => {
    const file = dom.file.files?.[0];
    if (!file) return;
    try {
      setManifest(coerceManifest(JSON.parse(await file.text())), file.name);
      showBanner('');
      toast(`Imported ${file.name}`);
    } catch (err) {
      toast(`Import failed: ${err.message}`, true);
    }
    dom.file.value = '';
  });

  // --- banner ------------------------------------------------------
  $('#btn-reload').addEventListener('click', () => {
    savePrefs();
    loadFromUrl(state.prefs.url);
  });
  $('#btn-discard').addEventListener('click', () => {
    if (!confirm('Discard the locally saved working copy?')) return;
    discardDraft();
    showBanner('');
    loadFromUrl(state.prefs.url);
  });

  // --- filters -----------------------------------------------------
  dom.filterCategory.innerHTML = ['all', ...CATEGORIES]
    .map((c) => `<option value="${c}">${c}</option>`)
    .join('');
  dom.filterCategory.value = state.filter.category;
  dom.filterText.addEventListener('input', () => {
    state.filter.text = dom.filterText.value;
    renderList();
  });
  dom.filterCategory.addEventListener('change', () => {
    state.filter.category = dom.filterCategory.value;
    renderList();
  });
  dom.filterHidden.addEventListener('change', () => {
    state.filter.hidden = dom.filterHidden.checked;
    renderList();
  });

  // --- list --------------------------------------------------------
  dom.list.addEventListener('click', (ev) => {
    const li = ev.target.closest('.entry');
    if (!li) return;
    state.selected = state.manifest.entries[Number(li.dataset.index)] ?? null;
    renderList();
    renderForm();
  });

  let dragFrom = -1;
  const clearDropMarks = () =>
    $$('.entry.is-drop', dom.list).forEach((n) => n.classList.remove('is-drop'));

  dom.list.addEventListener('dragstart', (ev) => {
    const li = ev.target.closest('.entry');
    if (!li) return;
    dragFrom = Number(li.dataset.index);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', String(dragFrom));
  });
  dom.list.addEventListener('dragover', (ev) => {
    const li = ev.target.closest('.entry');
    if (!li || dragFrom < 0) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    li.classList.add('is-drop');
  });
  dom.list.addEventListener('dragleave', (ev) => {
    if (ev.target.closest('.entry')) ev.target.closest('.entry').classList.remove('is-drop');
  });
  dom.list.addEventListener('drop', (ev) => {
    const li = ev.target.closest('.entry');
    clearDropMarks();
    if (!li || dragFrom < 0) return;
    ev.preventDefault();
    moveByIndex(dragFrom, Number(li.dataset.index));
    dragFrom = -1;
  });
  dom.list.addEventListener('dragend', () => {
    clearDropMarks();
    dragFrom = -1;
  });

  $('#btn-new').addEventListener('click', newEntry);
  $('#btn-dup').addEventListener('click', duplicateEntry);
  $('#btn-del').addEventListener('click', deleteEntry);
  $('#btn-up').addEventListener('click', () => moveSelected(-1));
  $('#btn-down').addEventListener('click', () => moveSelected(1));
  $('#btn-sort').addEventListener('click', sortEntries);
  $('#btn-renumber').addEventListener('click', renumber);

  // --- form --------------------------------------------------------
  dom.form.addEventListener('submit', (ev) => ev.preventDefault());

  const onEdit = (ev) => {
    const el = ev.target.closest('[data-path]');
    const entry = state.selected;
    if (!el || !entry) return;
    setPath(entry, el.dataset.path, readControl(el));

    // Cheap live feedback that does not steal focus.
    const resolved = $(`[data-resolved="${el.dataset.path}"]`, dom.form);
    if (resolved) {
      const v = getPath(entry, el.dataset.path);
      resolved.textContent = v ? `→ ${resolvePathRef(entry.dir ?? '', v)}` : '';
    }
    dom.formTitle.textContent = `${entry.title || '(untitled)'} — ${entry.id || '(no id)'}`;
    changed({ form: false });
  };
  dom.form.addEventListener('input', onEdit);
  dom.form.addEventListener('change', onEdit);

  $('#btn-sync-paths').addEventListener('click', syncPaths);
  $('#btn-normalize-repo').addEventListener('click', normalizeRepo);

  // --- raw pane ----------------------------------------------------
  dom.raw.addEventListener('input', () => {
    state.rawDirty = true;
    renderStatus();
  });
  $('#btn-apply-raw').addEventListener('click', () => {
    try {
      setManifest(coerceManifest(JSON.parse(dom.raw.value)), `${state.origin} (hand-edited)`);
      toast('Applied raw JSON');
    } catch (err) {
      toast(`JSON error: ${err.message}`, true);
    }
  });
  $('#btn-revert-raw').addEventListener('click', () => {
    state.rawDirty = false;
    renderPreview();
    renderStatus();
  });
  $('#btn-save').addEventListener('click', () => {
    saveDraft();
    toast('Working copy saved to localStorage');
  });

  // --- shortcuts ---------------------------------------------------
  window.addEventListener('keydown', (ev) => {
    if (!(ev.metaKey || ev.ctrlKey)) return;
    if (ev.key.toLowerCase() !== 's') return;
    ev.preventDefault();
    if (ev.shiftKey) {
      downloadJson();
    } else {
      saveDraft();
      toast('Working copy saved to localStorage');
    }
  });
}

/* ------------------------------------------------------------------ *
 * Chrome helpers
 * ------------------------------------------------------------------ */

let toastTimer = 0;

function toast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.classList.toggle('toast--bad', isError);
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.hidden = true;
  }, 3200);
}

function showBanner(text) {
  dom.bannerText.textContent = text;
  dom.banner.hidden = !text;
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function init() {
  loadPrefs();
  buildForm();
  wire();

  const draft = loadDraft();
  if (draft) {
    state.savedAt = draft.savedAt ?? null;
    // Don't re-save: keep the draft's own timestamp intact.
    setManifest(draft.manifest, draft.origin || 'draft', { save: false });
    const when = draft.savedAt ? new Date(draft.savedAt) : null;
    const stamp = when && !Number.isNaN(when.getTime()) ? ` (${when.toLocaleString()})` : '';
    showBanner(`Restored your working copy from localStorage${stamp}.`);
    renderStatus();
  } else {
    await loadFromUrl(state.prefs.url, { silent: true });
  }
}

init();
