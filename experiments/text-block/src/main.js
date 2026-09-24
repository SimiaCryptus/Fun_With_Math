import { createStore } from './state.js';
import { createChars, applyEdit, ringOf, textOf, graphemeIndex, SENTINEL_ID } from './ring.js';
import { computeSA } from './sort.js';
import * as selection from './selection.js';
import { attachDrag } from './drag.js';
import { createRenderer, glyphOf } from './render.js';
import { createRingView } from './ringview.js';
import { createEmbedMode } from './embed/mode.js';
import { DEFAULT_PARAMS } from './embed/params.js';

const LIMIT = 256;
const DEFAULT_TEXT = 'abracadabra';

const $ = (id) => document.getElementById(id);
const input = $('text');
const sentinelBox = $('sentinel');
const gutterBox = $('gutter');
const pathsBox = $('paths');
const resetBtn = $('reset');
const truncateBtn = $('truncate');
const viewport = $('viewport');
const live = $('live');

const renderer = createRenderer({
  viewport,
  header: $('header'),
  rows: $('rows'),
  paths: $('paths-layer'),
  message: $('message'),
});

const sortFor = (chars, sentinel) =>
  chars.length && chars.length <= LIMIT ? computeSA(chars, { sentinel }) : new Int32Array(0);

const initialChars = createChars(input.value);
const store = createStore({
  chars: initialChars,
  sentinel: sentinelBox.checked,
  sa: sortFor(initialChars, sentinelBox.checked),
  shift: 0,
  selection: new Set(),
  anchor: null,
  hover: null,
  cursor: null,
  showPaths: pathsBox.checked,
   mode: 'block',
   embed: { params: { ...DEFAULT_PARAMS }, running: false, version: 0, colorBlock: false },
});

const ringFor = (s) => ringOf(s.chars, s.sentinel);
const isLive = (s) => s.chars.length > 0 && s.chars.length <= LIMIT;
// Read-only ring strip (shown in embedding mode) mirroring selection / hover.
const ringView = createRingView($('ring-view'), {
   onSelect: (id, mods) => applySelection(id, mods),
   onHover: (id) => { if (id !== store.get().hover) store.set({ hover: id }, ['hover']); },
   onClear: () => clearSelection(),
});

// ---------------------------------------------------------------- readouts

function charName(c) {
  if (c.sentinel) return 'sentinel';
  if (c.ch === ' ') return 'space';
  return c.ch;
}

function describe(id, s = store.get()) {
  const ring = ringFor(s);
  const p = ring.findIndex((c) => c.id === id);
  return p < 0 ? '' : `position ${p}, character ${charName(ring[p])}`;
}

function announce(msg) {
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = msg; });
}

function updateReadouts(s) {
  const ring = ringFor(s);
  const n = s.chars.length ? ring.length : 0;
  $('n').textContent = n;
  $('bwt').textContent = isLive(s)
    ? Array.from(s.sa, (o) => glyphOf(ring[(o + n - 1) % n].ch)).join('')
    : '—';

  const posOf = new Map(ring.map((c, i) => [c.id, i]));
  const items = [...s.selection]
    .map((id) => posOf.get(id))
    .filter((p) => p !== undefined)
    .sort((a, b) => a - b);
  $('selinfo').textContent = items.length
    ? `${items.length} position${items.length > 1 ? 's' : ''}: ` +
      items.slice(0, 8).map((p) => `pos ${p} '${glyphOf(ring[p].ch)}'`).join(', ') +
      (items.length > 8 ? ', …' : '')
    : 'none';

  const tooLong = s.chars.length > LIMIT;
  $('warning').hidden = !tooLong;
  if (tooLong) {
    $('warning-text').textContent = `Text is ${s.chars.length} characters (limit ${LIMIT}); the block is paused.`;
  }
}

function clampCursor() {
  const c = store.get().cursor;
  if (!c) return;
  const rowsN = renderer.rowCount;
  const colsN = renderer.cols;
  if (!rowsN || !colsN) {
    store.set({ cursor: null }, ['cursor']);
    return;
  }
  const row = Math.min(c.row, rowsN - 1);
  const col = Math.min(c.col, colsN - 1);
  if (row !== c.row || col !== c.col) store.set({ cursor: { row, col } }, ['cursor']);
}

// ---------------------------------------------------------------- subscriptions

store.subscribe('text', (s) => {
  renderer.syncText(s, { limit: LIMIT });
   ringView.sync(ringFor(s), s);
  updateReadouts(s);
  clampCursor();
});
store.subscribe('shift', (s) => renderer.setShift(s.shift));
store.subscribe('selection', (s) => {
  renderer.highlights(s);
   ringView.highlights(s);
  updateReadouts(s);
});
store.subscribe('hover', (s) => {
   renderer.highlights(s);
   ringView.highlights(s);
});
store.subscribe('cursor', (s) => renderer.setCursor(s.cursor));
store.subscribe('paths', (s) => renderer.setShowPaths(s.showPaths));

// ---------------------------------------------------------------- editing

let pending = null;

input.addEventListener('beforeinput', () => {
  pending = { value: input.value, start: input.selectionStart, end: input.selectionEnd };
});

input.addEventListener('input', () => {
  const oldText = textOf(store.get().chars);
  const newText = input.value;
  let hint = null;
  if (pending && pending.value === oldText && pending.start != null && pending.end != null) {
    hint = {
      oldStart: graphemeIndex(oldText, pending.start),
      oldEnd: graphemeIndex(oldText, pending.end),
      newCaret: graphemeIndex(newText, input.selectionStart ?? newText.length),
    };
  }
  pending = null;
  commitText(newText, hint);
});

function commitText(newText, hint) {
  const s = store.get();
  const { chars, removed } = applyEdit(s.chars, newText, hint);
  store.set(
    { chars, sa: sortFor(chars, s.sentinel), ...selection.prune(s, removed) },
    ['text'],
  );
}

sentinelBox.addEventListener('change', () => {
  const s = store.get();
  const sentinel = sentinelBox.checked;
  const patch = sentinel ? {} : selection.prune(s, new Set([SENTINEL_ID]));
  store.set({ sentinel, sa: sortFor(s.chars, sentinel), ...patch }, ['text']);
});

resetBtn.addEventListener('click', () => {
  input.value = DEFAULT_TEXT;
  const chars = createChars(DEFAULT_TEXT);
  const s = store.get();
  renderer.setDx(0);
  store.set(
    { chars, sa: sortFor(chars, s.sentinel), shift: 0, hover: null, cursor: null, ...selection.cleared() },
    ['text'],
  );
  announce('Reset.');
});

truncateBtn.addEventListener('click', () => {
  const s = store.get();
  const chars = s.chars.slice(0, LIMIT);
  const removed = new Set(s.chars.slice(LIMIT).map((c) => c.id));
  input.value = textOf(chars);
  store.set({ chars, sa: sortFor(chars, s.sentinel), ...selection.prune(s, removed) }, ['text']);
});

gutterBox.addEventListener('change', () => {
  viewport.classList.toggle('no-gutter', !gutterBox.checked);
  renderer.layout();
  clampCursor();
});

pathsBox.addEventListener('change', () => {
  store.set({ showPaths: pathsBox.checked }, ['paths']);
});

// ---------------------------------------------------------------- selection

function applySelection(id, mods) {
  const s = store.get();
  const res = selection.select(s, id, mods, ringFor(s));
  store.set({ selection: res.selection, anchor: res.anchor }, ['selection']);
  const next = store.get();
  if (res.range) {
    announce(`${res.range.length} positions selected, from ${describe(res.range[0], next)} to ${describe(res.range[res.range.length - 1], next)}.`);
  } else {
    const on = res.selection.has(id);
    announce(`${describe(id, next)}, ${on ? 'selected' : 'deselected'}; appears in ${renderer.rowCount} rows. ${res.selection.size} selected in total.`);
  }
}

function clearSelection() {
  if (!store.get().selection.size) return;
  store.set(selection.cleared(), ['selection']);
  announce('Selection cleared.');
}

function setShift(v) {
  if (v !== store.get().shift) store.set({ shift: v }, ['shift']);
}

// ---------------------------------------------------------------- pointer

let dragStartShift = 0;

function dragTo(dx) {
  const w = renderer.metrics.cellW;
  const steps = Math.round(dx / w);
  setShift(dragStartShift + steps);
  renderer.setDx(dx - steps * w);
}

attachDrag(viewport, {
  onStart() {
    dragStartShift = store.get().shift;
    viewport.classList.add('dragging');
    viewport.classList.remove('snapping');
    if (store.get().hover != null) store.set({ hover: null }, ['hover']);
  },
  onMove(dx) {
    if (isLive(store.get())) dragTo(dx);
  },
  onEnd(dx) {
    if (isLive(store.get())) dragTo(dx);
    viewport.classList.remove('dragging');
    viewport.classList.add('snapping');
    renderer.setDx(0);
    setTimeout(() => viewport.classList.remove('snapping'), 160);
  },
  onClick(e) {
    const cell = e.target.closest?.('.cell[data-id]');
    if (!cell) {
      clearSelection();
      return;
    }
    applySelection(cell._id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
    viewport.focus({ preventScroll: true });
  },
});

viewport.addEventListener('contextmenu', (e) => {
  if (e.ctrlKey) e.preventDefault(); // macOS ctrl+click
});

viewport.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || viewport.classList.contains('dragging')) return;
  const cell = e.target.closest?.('.cell[data-id]');
  const id = cell ? cell._id ?? null : null;
  if (id !== store.get().hover) store.set({ hover: id }, ['hover']);
});

viewport.addEventListener('pointerleave', () => {
  if (store.get().hover != null) store.set({ hover: null }, ['hover']);
});

// ---------------------------------------------------------------- keyboard

function moveCursor(c) {
  store.set({ cursor: c }, ['cursor']);
  const s = store.get();
  const id = renderer.idAt(c.row, c.col);
  if (id != null) announce(`row ${c.row}, offset ${s.sa[c.row]}: ${describe(id, s)}`);
}

viewport.addEventListener('keydown', (e) => {
  const s = store.get();
  if (e.key === 'Escape') {
    e.preventDefault();
    clearSelection();
    return;
  }
  if (!isLive(s)) return;

  const rowsN = renderer.rowCount;
  const colsN = renderer.cols;
  const cur = s.cursor;

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.altKey) { setShift(s.shift + dir); return; }
      if (!cur) { moveCursor({ row: 0, col: 0 }); return; }
      let col = cur.col + dir;
      if (col < 0) { col = 0; setShift(s.shift + 1); }
      else if (col >= colsN) { col = colsN - 1; setShift(s.shift - 1); }
      moveCursor({ row: cur.row, col });
      return;
    }
    case 'ArrowUp':
    case 'ArrowDown':
    case 'PageUp':
    case 'PageDown': {
      e.preventDefault();
      if (!cur) { moveCursor({ row: 0, col: 0 }); return; }
      const step = e.key.startsWith('Page') ? 10 : 1;
      const dir = e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 1;
      const row = Math.max(0, Math.min(rowsN - 1, cur.row + dir * step));
      moveCursor({ row, col: cur.col });
      return;
    }
    case 'Home':
      e.preventDefault();
      setShift(0);
      return;
    case ' ':
    case 'Enter': {
      e.preventDefault();
      if (!cur) { moveCursor({ row: 0, col: 0 }); return; }
      const id = renderer.idAt(cur.row, cur.col);
      if (id != null) applySelection(id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
      return;
    }
    default:
  }
});

// ---------------------------------------------------------------- layout

new ResizeObserver(() => {
  renderer.layout();
  clampCursor();
}).observe(viewport);
// ---------------------------------------------------------------- embeddings mode
createEmbedMode({
   store,
   renderer,
   ringFor,
   select: applySelection,
   clear: clearSelection,
   els: {
     scatter: $('scatter'),
     tip: $('scatter-tip'),
     panel: $('embed-panel'),
     boundary: $('boundary'),
     modeButtons: document.querySelectorAll('.mode-switch button[data-mode]'),
   },
});


store.emit('text');
store.emit('mode');