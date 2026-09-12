import { VOXEL, VOXEL_TYPES } from '../world/voxel.js';
import { Simulation } from '../simulation.js';
import { GUARD_TYPES } from '../units/guard.js';
import { EQUIPMENT } from '../items/equipment.js';
import { SIGNS } from '../items/sign.js';
import { ROLES } from '../units/roles/index.js';
import {
  buildWorld, exportLevel, normalizeLevel, parseLevel, stringifyLevel, newBlankLevel, encodeLevelHash,
} from '../world/level-loader.js';

const FACINGS = [
  { label: '+X (east)', dir: [1, 0] },
  { label: '+Z (south)', dir: [0, 1] },
  { label: '-X (west)', dir: [-1, 0] },
  { label: '-Z (north)', dir: [0, -1] },
];

const HOTKEYS = '1234567890';
const MIN_SIZE = 8;
const MAX_SIZE = 128;

const TOOLS = [
   ...VOXEL_TYPES.filter((t) => t.solid || t.climbable).map((t) => ({
    id: `voxel:${t.name}`,
    kind: 'voxel',
    type: t.id,
    label: t.name[0].toUpperCase() + t.name.slice(1),
    color: t.top ?? t.color,
  })),
  { id: 'erase', kind: 'erase', label: 'Erase', color: 0x2a2f3a },
  { id: 'spawn', kind: 'spawn', label: 'Drop pod', color: 0x8fd3ff },
   ...Object.entries(GUARD_TYPES).map(([type, def]) => ({
     id: `guard:${type}`, kind: 'guard', type, label: def.label, color: def.color,
   })),
  { id: 'objective', kind: 'objective', label: 'Objective zone', color: 0xffdd55 },
].map((t, i) => ({ ...t, hotkey: HOTKEYS[i] ?? null }));

const DEFAULT_HINT =
  'Click a voxel face to use the selected tool. Shift-click or Box mode [B] fills between two corners. Left-drag orbits, right-drag pans, P plays.';

// ---- DOM helpers ------------------------------------------------------------------------

function el(tag, className, id) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (id) e.id = id;
  return e;
}

function button(label, onClick, className = 'btn') {
  const b = el('button', className);
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function section(title) {
  const h = el('h2');
  h.textContent = title;
  return h;
}

function field(label, control) {
  const row = el('div', 'field');
  const l = el('label');
  l.textContent = label;
  row.append(l, control);
  return row;
}

function numberInput({ min, max, step = 1 }, onChange) {
  const i = el('input');
  i.type = 'number';
  if (min !== undefined) i.min = String(min);
  if (max !== undefined) i.max = String(max);
  i.step = String(step);
  i.addEventListener('change', () => {
    let v = Number(i.value);
    if (!Number.isFinite(v)) v = min ?? 0;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (step === 1) v = Math.round(v);
    i.value = String(v);
    onChange(v);
  });
  return i;
}

function textInput(onChange) {
  const i = el('input');
  i.type = 'text';
  i.addEventListener('input', () => onChange(i.value));
  return i;
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const cellArr = (c) => [c.x, c.y, c.z];
const cellStr = (c) => `(${c.x}, ${c.y}, ${c.z})`;
const sameCell = (arr, c) => arr[0] === c.x && arr[1] === c.y && arr[2] === c.z;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'level';
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyText(text, fallbackArea) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackArea) {
      fallbackArea.value = text;
      fallbackArea.focus();
      fallbackArea.select();
    }
    return false;
  }
}

/**
 * In-browser level designer (idea.md §4.2). Owns an editable World + level metadata, shows a
 * non-ticking Simulation so the pod, guards and objective zone render exactly as in play, and
 * hands a validated level object back to the game on Play.
 */
export class Editor {
  /**
   * @param root      container element for the editor UI
   * @param renderer  shared Renderer (world meshes, cursor, bounds)
   * @param handlers  { onPlay(level) }
   */
  constructor(root, renderer, handlers) {
    this.root = root;
    this.renderer = renderer;
    this.handlers = handlers;
    this.level = null;
    this.world = null;
    this.sim = null;
    this.tool = TOOLS.find((t) => t.id === 'voxel:dirt') || TOOLS[0];
    this.boxMode = false;
    this.pending = null; // first corner of a box / objective zone
    this.hover = null;
    this.statusTimer = 0;
    this.f = {}; // form controls
    this.toolButtons = new Map();
    this.buildUI();
    this.selectTool(this.tool.id);
    this.setHint(DEFAULT_HINT);
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  // ---- lifecycle ----------------------------------------------------------------------

  /** Load a level (any valid level JSON object) into the designer. */
  open(level, { keepCamera = false } = {}) {
    const lv = normalizeLevel(level);
    this.world = buildWorld(lv);
    this.level = exportLevel(lv, this.world); // world is authoritative for voxels from now on
    this.pending = null;
    this.renderer.setWorld(this.world, { resetCamera: !keepCamera });
    this.renderer.setBoundsVisible(true);
    this.rebuildSim();
    this.syncForm();
    this.root.classList.remove('hidden');
    this.onHover(this.hover);
  }

  close() {
    this.root.classList.add('hidden');
    this.renderer.setBoundsVisible(false);
    this.renderer.setCursor(null);
  }

  /** Re-create the preview simulation (never stepped) so guards / pod / objective re-render. */
  rebuildSim() {
    this.sim = new Simulation(this.world, this.level);
    this.renderer.setupLevel(this.sim);
    this.updateInfo();
  }

  /** Validated deep copy of the current level, including the voxel blob. */
  currentLevel() {
    return normalizeLevel(exportLevel(this.level, this.world));
  }

  play() {
    if (!this.level) return;
    this.handlers.onPlay?.(this.currentLevel());
  }

  newLevel() {
    this.open(newBlankLevel());
    this.setStatus('Started a new blank level.');
  }

  loadText(text, source = 'pasted JSON') {
    try {
      const level = parseLevel(text);
      this.open(level);
      this.setStatus(`Loaded "${level.name}" from ${source}.`);
    } catch (err) {
      console.error(err);
      this.setStatus(`⚠ ${err.message}`);
    }
  }

  // ---- UI -------------------------------------------------------------------------------

  buildUI() {
    const root = this.root;
    root.innerHTML = '';
    const panel = el('div', 'panel', 'editor-panel');
    const f = this.f;

    const title = el('h1');
    title.textContent = 'Level Designer';
    panel.append(title);

    const actions = el('div', 'row');
    actions.append(
      button('▶ Play [P]', () => this.play(), 'btn primary'),
      button('New', () => this.newLevel()),
    );
    panel.append(actions);

    this.status = el('div', 'status hidden');
    panel.append(this.status);

    // Level metadata
    panel.append(section('Level'));
    f.name = textInput((v) => { this.level.name = v; });
    panel.append(field('Name', f.name));
    f.description = el('textarea');
    f.description.rows = 2;
    f.description.placeholder = 'Description shown when the level starts';
    f.description.addEventListener('input', () => { this.level.description = f.description.value; });
    panel.append(f.description);

    // Size
    panel.append(section('Size (w × h × d)'));
    const sizeRow = el('div', 'row');
    f.w = numberInput({ min: MIN_SIZE, max: MAX_SIZE }, () => {});
    f.h = numberInput({ min: MIN_SIZE, max: MAX_SIZE }, () => {});
    f.d = numberInput({ min: MIN_SIZE, max: MAX_SIZE }, () => {});
    sizeRow.append(f.w, f.h, f.d, button('Resize', () => this.resize()));
    panel.append(sizeRow);

    // Drop pod
    panel.append(section('Drop pod'));
    f.count = numberInput({ min: 1, max: 500 }, (v) => { this.level.spawn.count = v; });
    panel.append(field('Troops', f.count));
    f.rate = numberInput({ min: 0.1, max: 30, step: 0.1 }, (v) => { this.level.spawn.rate = v; });
    panel.append(field('Seconds / troop', f.rate));
    f.facing = el('select');
    FACINGS.forEach((fc, i) => {
      const opt = el('option');
      opt.value = String(i);
      opt.textContent = fc.label;
      f.facing.append(opt);
    });
    f.facing.addEventListener('change', () => {
      this.level.spawn.dir = [...FACINGS[Number(f.facing.value)].dir];
      this.rebuildSim();
    });
    panel.append(field('Facing', f.facing));
    this.spawnInfo = el('div', 'info');
    panel.append(this.spawnInfo);

    // Objective
    panel.append(section('Objective (reach)'));
    f.required = numberInput({ min: 1, max: 500 }, (v) => { this.level.objective.required = v; });
    panel.append(field('Troops required', f.required));
    this.objInfo = el('div', 'info');
    panel.append(this.objInfo);

    // Rules
    panel.append(section('Rules'));
    f.lethalFall = numberInput({ min: 1, max: 64 }, (v) => { this.level.lethalFall = v; });
    panel.append(field('Lethal fall (voxels)', f.lethalFall));
    f.timeLimit = numberInput({ min: 0, max: 3600 }, (v) => { this.level.timeLimit = v; });
    panel.append(field('Time limit (s, 0 = none)', f.timeLimit));

    // Budgets
    panel.append(section('Budgets'));
     f.budget = { crates: {}, signs: {}, roles: {} };
    for (const [key, def] of Object.entries(EQUIPMENT)) {
      const i = numberInput({ min: 0, max: 99 }, (v) => { this.level.budget.crates[key] = v; });
      f.budget.crates[key] = i;
      panel.append(field(def.label, i));
    }
     for (const [key, def] of Object.entries(SIGNS)) {
       const i = numberInput({ min: 0, max: 99 }, (v) => { this.level.budget.signs[key] = v; });
       f.budget.signs[key] = i;
       panel.append(field(def.label, i));
     }
    for (const [key, role] of Object.entries(ROLES)) {
      const i = numberInput({ min: 0, max: 99 }, (v) => { this.level.budget.roles[key] = v; });
      f.budget.roles[key] = i;
      panel.append(field(`${role.label}s`, i));
    }

    // Tools
    panel.append(section('Tools'));
    const grid = el('div', 'editor-tools');
    for (const tool of TOOLS) {
      const btn = el('button', 'tool');
      btn.type = 'button';
      const swatch = el('span', 'swatch');
      swatch.style.background = hex(tool.color);
      const name = el('span');
      name.textContent = tool.label;
      const key = el('span', 'count');
      key.textContent = tool.hotkey ? `[${tool.hotkey}]` : '';
      btn.append(swatch, name, key);
      btn.addEventListener('click', () => this.selectTool(tool.id));
      this.toolButtons.set(tool.id, btn);
      grid.append(btn);
    }
    panel.append(grid);
    f.box = el('input');
    f.box.type = 'checkbox';
    f.box.addEventListener('change', () => this.setBoxMode(f.box.checked));
    panel.append(field('Box mode [B] (two-corner fill)', f.box));
    this.guardInfo = el('div', 'info');
    panel.append(this.guardInfo);

    // Export / import
    panel.append(section('Export & import'));
    const exportRow = el('div', 'row');
    exportRow.append(
      button('Download JSON', () => this.downloadJSON()),
      button('Copy JSON', () => this.copyJSON()),
      button('Copy play link', () => this.copyLink()),
    );
    panel.append(exportRow);

    f.file = el('input');
    f.file.type = 'file';
    f.file.accept = '.json,application/json';
    f.file.classList.add('hidden');
    f.file.addEventListener('change', async () => {
      const file = f.file.files?.[0];
      if (!file) return;
      this.loadText(await file.text(), file.name);
      f.file.value = '';
    });
    panel.append(f.file);

    f.paste = el('textarea');
    f.paste.rows = 5;
    f.paste.placeholder = 'Paste level JSON here…';
    panel.append(f.paste);
    const importRow = el('div', 'row');
    importRow.append(
      button('Load pasted JSON', () => this.loadText(f.paste.value)),
      button('Load file…', () => f.file.click()),
    );
    panel.append(importRow);

    root.append(panel);

    this.hint = el('div', 'panel', 'editor-hint');
    root.append(this.hint);
  }

  syncForm() {
    const L = this.level, f = this.f;
    f.name.value = L.name;
    f.description.value = L.description;
    [f.w.value, f.h.value, f.d.value] = L.size.map(String);
    f.count.value = String(L.spawn.count);
    f.rate.value = String(L.spawn.rate);
    const facing = FACINGS.findIndex((fc) => fc.dir[0] === L.spawn.dir[0] && fc.dir[1] === L.spawn.dir[1]);
    f.facing.value = String(facing < 0 ? 0 : facing);
    f.required.value = String(L.objective.required);
    f.lethalFall.value = String(L.lethalFall);
    f.timeLimit.value = String(L.timeLimit);
    for (const k of Object.keys(f.budget.crates)) f.budget.crates[k].value = String(L.budget.crates[k] ?? 0);
     for (const k of Object.keys(f.budget.signs)) f.budget.signs[k].value = String(L.budget.signs[k] ?? 0);
    for (const k of Object.keys(f.budget.roles)) f.budget.roles[k].value = String(L.budget.roles[k] ?? 0);
    f.box.checked = this.boxMode;
    this.updateInfo();
  }

  updateInfo() {
    if (!this.level) return;
    const L = this.level;
    const s = L.spawn.pos, o = L.objective, n = L.guards.length;
    this.spawnInfo.textContent = `Pod at (${s.join(', ')}) — use the Drop pod tool to move it.`;
    this.objInfo.textContent = `Zone (${o.from.join(', ')}) → (${o.to.join(', ')}) — Objective tool: click two corners.`;
     this.guardInfo.textContent = `${n} guard${n === 1 ? '' : 's'} placed — the Sentry / Turret / Grenadier tools add or remove them.`;
  }

  setStatus(text) {
    this.status.textContent = text;
    this.status.classList.remove('hidden');
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.status.classList.add('hidden'), 6000);
  }

  setHint(text) {
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  selectTool(id) {
    this.tool = TOOLS.find((t) => t.id === id) || this.tool;
    this.pending = null;
    for (const [tid, btn] of this.toolButtons) btn.classList.toggle('active', tid === this.tool.id);
    this.onHover(this.hover);
  }

  setBoxMode(on) {
    this.boxMode = on;
    this.f.box.checked = on;
    this.pending = null;
    this.onHover(this.hover);
  }

  // ---- export helpers -------------------------------------------------------------------

  downloadJSON() {
    const level = this.currentLevel();
    download(`${slugify(level.name)}.json`, stringifyLevel(level));
    this.setStatus(`Downloaded ${slugify(level.name)}.json`);
  }

  async copyJSON() {
    const ok = await copyText(stringifyLevel(this.currentLevel()), this.f.paste);
    this.setStatus(ok ? 'Level JSON copied to clipboard.' : 'Clipboard unavailable — JSON placed in the text box below.');
  }

  async copyLink() {
    const url = new URL(location.href);
    url.search = '';
    url.hash = `level=${encodeLevelHash(this.currentLevel())}`;
    const ok = await copyText(url.toString(), this.f.paste);
    const kb = (url.toString().length / 1024).toFixed(1);
    this.setStatus(ok ? `Play link copied (${kb} KB). Add &edit to the hash to open it in the designer.` : 'Clipboard unavailable — link placed in the text box below.');
  }

  // ---- level operations -----------------------------------------------------------------

  resize() {
    const w = clamp(Math.round(Number(this.f.w.value)) || MIN_SIZE, MIN_SIZE, MAX_SIZE);
    const h = clamp(Math.round(Number(this.f.h.value)) || MIN_SIZE, MIN_SIZE, MAX_SIZE);
    const d = clamp(Math.round(Number(this.f.d.value)) || MIN_SIZE, MIN_SIZE, MAX_SIZE);
    this.world = this.world.resized(w, h, d);
    const L = this.level;
    L.size = [w, h, d];
    const max = [w - 1, h - 1, d - 1];
    L.spawn.pos = L.spawn.pos.map((v, i) => clamp(v, 0, max[i]));
    L.objective.from = L.objective.from.map((v, i) => clamp(v, 0, max[i]));
    L.objective.to = L.objective.to.map((v, i) => clamp(v, 0, max[i]));
    L.guards = L.guards.filter((g) => g.pos.every((v, i) => v >= 0 && v <= max[i]));
    this.pending = null;
    this.renderer.setWorld(this.world, { resetCamera: true });
    this.rebuildSim();
    this.syncForm();
    this.setStatus(`Resized to ${w} × ${h} × ${d}.`);
  }

   toggleGuard(c, type = 'sentry') {
    const i = this.level.guards.findIndex((g) => sameCell(g.pos, c));
    if (i >= 0) {
      this.level.guards.splice(i, 1);
    } else {
      const f = this.level.spawn.dir;
       this.level.guards.push({ type, pos: cellArr(c), dir: [-f[0], -f[1]] });
    }
    this.rebuildSim();
  }

  /** Which cell a tool acts on: erase removes the hit voxel, everything else uses the air cell on its face. */
  targetCell(hit) {
    return this.tool.kind === 'erase' ? hit.cell : hit.adjacent;
  }

  inBounds(c) {
    return this.world.inBounds(c.x, c.y, c.z);
  }

  // ---- input ------------------------------------------------------------------------------

  onHover(hit) {
    this.hover = hit;
    if (!this.world || !this.isOpen) return;
    const r = this.renderer;
    const t = this.tool;

    if (!hit) {
      r.setCursor(null);
      this.setHint(DEFAULT_HINT);
      return;
    }
    if (hit.type === 'unit') {
       const g = hit.batch === 'guards' ? hit.unit : null;
      if (g && t.kind === 'guard') {
        r.setCursor(g.cell, 0xff6a6a);
         this.setHint(`Click to remove the ${g.def.label.toLowerCase()} at ${cellStr(g.cell)}`);
      } else {
        r.setCursor(null);
         this.setHint(g ? 'Select a guard tool to remove guards' : 'Click a voxel face');
      }
      return;
    }

    const target = this.targetCell(hit);
    if (!this.inBounds(target)) {
      r.setCursor(null);
      this.setHint('Outside the level bounds — resize the level to grow the map');
      return;
    }
    const c = cellStr(target);
    if (this.pending) {
      r.setCursor(this.pending, t.color, target);
      this.setHint(`${t.label}: click to fill ${cellStr(this.pending)} → ${c} (Esc cancels)`);
      return;
    }
    r.setCursor(target, t.color);
    const corner = this.boxMode ? ' — first corner' : '';
    switch (t.kind) {
      case 'voxel': this.setHint(`Place ${t.label} at ${c}${corner}`); break;
      case 'erase': this.setHint(`Erase voxel at ${c}${corner}`); break;
      case 'spawn': this.setHint(`Move the drop pod to ${c}`); break;
      case 'guard':
         this.setHint(this.level.guards.some((g) => sameCell(g.pos, target))
           ? `Remove the guard at ${c}`
           : `Place a ${t.label.toLowerCase()} at ${c}`);
        break;
      case 'objective': this.setHint(`Objective zone: click the first corner at ${c}`); break;
      default: break;
    }
  }

  onClick(hit, e) {
    if (!hit || !this.world) return;
    const t = this.tool;

    if (hit.type === 'unit') {
      if (hit.batch === 'guards' && t.kind === 'guard') {
         const g = hit.unit;
        if (g) this.toggleGuard(g.cell);
      }
      this.onHover(hit);
      return;
    }

    const target = this.targetCell(hit);
    if (!this.inBounds(target)) {
      this.setStatus('That cell is outside the level bounds.');
      return;
    }

    switch (t.kind) {
      case 'voxel':
      case 'erase': {
        const type = t.kind === 'erase' ? VOXEL.AIR : t.type;
        if (this.boxMode || e?.shiftKey || this.pending) {
          if (!this.pending) { this.pending = target; break; }
          this.world.fill(cellArr(this.pending), cellArr(target), type);
          this.pending = null;
        } else {
          this.world.set(target.x, target.y, target.z, type);
        }
        break;
      }
      case 'spawn':
        this.level.spawn.pos = cellArr(target);
        this.rebuildSim();
        break;
      case 'guard':
         this.toggleGuard(target, t.type);
        break;
      case 'objective': {
        if (!this.pending) { this.pending = target; break; }
        const a = this.pending, b = target;
        this.level.objective.from = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)];
        this.level.objective.to = [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
        this.pending = null;
        this.rebuildSim();
        break;
      }
      default:
        break;
    }
    this.updateInfo();
    this.onHover(hit);
  }

  /** Returns true when the key was consumed by the editor. */
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const tool = TOOLS.find((t) => t.hotkey === e.key);
    if (tool) { this.selectTool(tool.id); return true; }
    switch (e.code) {
      case 'Escape':
        this.pending = null;
        this.onHover(this.hover);
        return true;
      case 'KeyB': this.setBoxMode(!this.boxMode); return true;
      case 'KeyP': this.play(); return true;
      default: return false;
    }
  }
}