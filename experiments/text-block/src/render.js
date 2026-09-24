import { setGlyph, flipRows } from './glyphfx.js';
import { ringOf } from './ring.js';

/**
 * DOM renderer: one row element per rotation, a constant number of cells per row.
 *
 * Cell i of a row sits at display column k = i - 1 (column -1 is a hidden buffer
 * for sub-cell drag smoothness). Relative column j = k - shift; ring position
 * p = (SA[r] + j) mod n.
 *
 * Rows are keyed by the stable id of their starting character, so re-sorting
 * moves existing rows (FLIP-animated) instead of rebuilding them.
 */

export const PALETTE_SIZE = 6;
const VISIBLE = { ' ': '␣', '\n': '⏎', '\r': '⏎', '\t': '⇥' };
export const glyphOf = (ch) => VISIBLE[ch] ?? ch;

const mod = (a, n) => ((a % n) + n) % n;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FLICKER_BUDGET = 400;

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function makeRowShell(root) {
  const rowEl = root ?? el('div');
  rowEl.classList.add('row');
  const gut = el('div', 'gut');
  const rank = el('span', 'rank');
  const off = el('span', 'off');
  gut.append(rank, off);
  const clip = el('div', 'clip');
  const track = el('div', 'track');
  clip.append(track);
  rowEl.append(gut, clip);
  return { el: rowEl, rank, off, track, cells: [], key: null };
}

function ensureCells(rec, count) {
  while (rec.cells.length < count) {
    const c = el('span', 'cell');
    rec.track.append(c);
    rec.cells.push(c);
  }
  while (rec.cells.length > count) rec.cells.pop().remove();
}

function setText(node, value) {
  const s = String(value);
  if (node.textContent !== s) node.textContent = s;
}

const regionOf = (j, n) => (j < 0 ? 'prefix' : j >= n ? 'wrap' : 'suffix');

/**
  * `source(state)` selects what this block shows: { chars, sa, cursor }.
  * The default is the forward block; the reversed block passes the reversed chars and its SA.
  */
const forwardSource = (s) => ({ chars: s.chars, sa: s.sa, cursor: s.cursor });

export function createRenderer({ viewport, header, rows, paths, message, label = 'r', source = forwardSource }) {
  const head = makeRowShell(header);
   head.rank.textContent = label;
  head.off.textContent = 'off';

  let ring = [];
  let sa = new Int32Array(0);
  let n = 0;
  let shift = 0;
  let cols = 0;
  let sel = new Set();
  let hover = null;
  let cursor = null;
  let showPaths = false;
  let active = false;
   let colors = null; // id -> css colour (embedding colour mode)
   let nn = new Set(); // ids previewed as nearest neighbours

  const metrics = { cellW: 16, rowH: 20, gutW: 0 };
  const rowMap = new Map();
  let order = [];
  let idIndex = new Map(); // id -> cells[]

  function measure() {
    const cs = getComputedStyle(viewport);
    metrics.cellW = parseFloat(cs.getPropertyValue('--cell-w')) || 16;
    metrics.rowH = parseFloat(cs.getPropertyValue('--row-h')) || 20;
    metrics.gutW = viewport.classList.contains('no-gutter')
      ? 0
      : parseFloat(cs.getPropertyValue('--gut-w')) || 0;
  }

  function computeCols() {
    measure();
    if (!n) return 0;
    const clipW = Math.max(0, viewport.clientWidth - metrics.gutW);
    const visible = Math.max(1, Math.ceil(clipW / metrics.cellW));
    return Math.max(1, Math.min(visible, 3 * n));
  }

  function resizeAll() {
    const count = cols + 2;
    ensureCells(head, count);
    for (const rec of order) ensureCells(rec, count);
  }

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
    viewport.classList.add('is-empty');
  }

  function teardown() {
    for (const rec of rowMap.values()) rec.el.remove();
    rowMap.clear();
    order = [];
    idIndex = new Map();
    ring = [];
    sa = new Int32Array(0);
    n = 0;
    cols = 0;
    ensureCells(head, 0);
    paths.replaceChildren();
    active = false;
  }

  function syncText(state, { limit = Infinity } = {}) {
     const src = source(state);
    sel = state.selection;
    hover = state.hover;
     cursor = src.cursor ?? null;
    shift = state.shift;
    showPaths = state.showPaths;

     if (src.chars.length === 0) {
      teardown();
      showMessage('The ring is empty. Type something above.');
      return;
    }
     if (src.chars.length > limit) {
      teardown();
       showMessage(`The ring has ${src.chars.length} characters; the block renders at most ${limit}. Truncate or shorten it.`);
      return;
    }

    message.hidden = true;
    viewport.classList.remove('is-empty');
    active = true;

     ring = ringOf(src.chars, state.sentinel);
     sa = src.sa;
    n = ring.length;

    const oldRank = new Map(order.map((rec, i) => [rec.key, i]));
    const next = [];
    const fresh = [];
    for (let r = 0; r < n; r++) {
      const key = ring[sa[r]].id;
      let rec = rowMap.get(key);
      if (!rec) {
        rec = makeRowShell();
        rec.key = key;
        rowMap.set(key, rec);
        fresh.push(rec);
      }
      next.push(rec);
    }
    const keep = new Set(next.map((rec) => rec.key));
    for (const [key, rec] of rowMap) {
      if (!keep.has(key)) {
        rec.el.remove();
        rowMap.delete(key);
      }
    }
    order = next;

    cols = computeCols();
    resizeAll();
    for (const rec of order) rows.append(rec.el); // moves existing rows into rank order

    relabel(true);

    const moves = [];
    order.forEach((rec, i) => {
      const o = oldRank.get(rec.key);
      if (o !== undefined && o !== i) moves.push({ el: rec.el, dy: (o - i) * metrics.rowH });
    });
    flipRows(moves, rows);

    if (oldRank.size) {
      for (const rec of fresh) {
        rec.el.classList.add('enter');
        rec.el.addEventListener('animationend', () => rec.el.classList.remove('enter'), { once: true });
      }
    }
    drawPaths();
  }

  function relabel(flicker) {
    if (!active) return;
    let budget = flicker ? FLICKER_BUDGET : 0;
    idIndex = new Map();
    const count = cols + 2;

    for (let i = 0; i < count; i++) {
      const j = i - 1 - shift;
      const jm = mod(j, n);
      const cell = head.cells[i];
      const cls = `cell ${regionOf(j, n)}${jm === 0 ? ' f' : ''}${jm === n - 1 ? ' l' : ''}${j === 0 ? ' origin' : ''}`;
      if (cell._cls !== cls) { cell.className = cls; cell._cls = cls; }
      setText(cell, jm === 0 ? 'F' : jm === n - 1 ? 'L' : '');
    }

    for (let r = 0; r < n; r++) {
      const rec = order[r];
      const off = sa[r];
      setText(rec.rank, r);
      setText(rec.off, off);
      rec.el.dataset.offset = off;

      for (let i = 0; i < count; i++) {
        const j = i - 1 - shift;
        const jm = mod(j, n);
        const p = mod(off + j, n);
        const c = ring[p];
        const cell = rec.cells[i];

        let cls = `cell ${regionOf(j, n)}`;
        if (jm === 0) cls += ' f';
        if (jm === n - 1) cls += ' l';
        if (j === 0) cls += ' origin';
        if (c.sentinel) cls += ' sentinel';
        if (sel.has(c.id)) cls += ` sel h${c.id % PALETTE_SIZE}`;
        if (hover === c.id) cls += ' hover';
         if (nn.has(c.id)) cls += ' nn';
         const ec = colors ? colors.get(c.id) : undefined;
         if (ec) cls += ' ec';
        if (cursor && cursor.row === r && cursor.col === i - 1) cls += ' cursor';

        if (cell._cls !== cls) { cell.className = cls; cell._cls = cls; }
         if (cell._ec !== ec) {
           if (ec) cell.style.setProperty('--ec', ec);
           else cell.style.removeProperty('--ec');
           cell._ec = ec;
         }
        if (cell._pos !== p) { cell.dataset.pos = p; cell._pos = p; }
        if (cell._id !== c.id) { cell.dataset.id = c.id; cell._id = c.id; }

        const g = glyphOf(c.ch);
        const doFlicker = budget > 0 && cell._glyph !== undefined && cell._glyph !== g;
        if (doFlicker) budget--;
        setGlyph(cell, g, doFlicker);

        let list = idIndex.get(c.id);
        if (!list) idIndex.set(c.id, (list = []));
        list.push(cell);
      }
    }
  }

  function highlights(state) {
    const nextSel = state.selection;
    const nextHover = state.hover;
    const touched = new Set();
    let selChanged = false;
    for (const id of sel) if (!nextSel.has(id)) { touched.add(id); selChanged = true; }
    for (const id of nextSel) if (!sel.has(id)) { touched.add(id); selChanged = true; }
    if (hover !== nextHover) {
      if (hover != null) touched.add(hover);
      if (nextHover != null) touched.add(nextHover);
    }
    sel = nextSel;
    hover = nextHover;

    for (const id of touched) {
      const on = sel.has(id);
      const hv = hover === id;
      for (const cell of idIndex.get(id) ?? []) {
        cell.classList.toggle('sel', on);
        cell.classList.toggle(`h${id % PALETTE_SIZE}`, on);
        cell.classList.toggle('hover', hv);
        cell._cls = cell.className;
      }
    }
    if (selChanged) drawPaths();
  }

  function cellAt(c) {
    return c ? order[c.row]?.cells[c.col + 1] : undefined;
  }

  function scrollRowIntoView(r) {
    const headerH = header.offsetHeight;
    const top = rows.offsetTop + r * metrics.rowH;
    if (top < viewport.scrollTop + headerH) {
      viewport.scrollTop = top - headerH;
    } else if (top + metrics.rowH > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = top + metrics.rowH - viewport.clientHeight;
    }
  }

  function setCursor(c) {
    const old = cellAt(cursor);
    if (old) { old.classList.remove('cursor'); old._cls = old.className; }
    cursor = c;
    const cell = cellAt(c);
    if (cell) {
      cell.classList.add('cursor');
      cell._cls = cell.className;
      scrollRowIntoView(c.row);
    }
  }

  function drawPaths() {
    paths.replaceChildren();
    if (!showPaths || !active || !sel.size) return;
    const { cellW, rowH, gutW } = metrics;
    paths.setAttribute('width', gutW + (cols + 1) * cellW);
    paths.setAttribute('height', n * rowH);
    const posOf = new Map(ring.map((c, i) => [c.id, i]));

    for (const id of sel) {
      const p = posOf.get(id);
      if (p === undefined) continue;
      let d = '';
      let pen = false;
      for (let r = 0; r < n; r++) {
        const j = mod(p - sa[r], n);
        let k = j + shift; // primary occurrence (within the unshifted row)
        if (k < 0 || k >= cols) k = mod(j + shift, n); // otherwise leftmost visible repeat
        if (k >= cols) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${gutW + k * cellW + cellW / 2} ${r * rowH + rowH / 2}`;
        pen = true;
      }
      if (!d) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `path h${id % PALETTE_SIZE}`);
      paths.append(path);
    }
  }

  function layout() {
    measure();
    if (!active) return cols;
    const c = computeCols();
    if (c !== cols) {
      cols = c;
      resizeAll();
      relabel(false);
    }
    drawPaths();
    return cols;
  }

  return {
    syncText,
    highlights,
    setCursor,
    layout,
    setShift(s) { shift = s; relabel(false); drawPaths(); },
    setDx(px) { viewport.style.setProperty('--dx', `${px}px`); },
    setShowPaths(v) { showPaths = v; drawPaths(); },
     /** Per-id colour map (embedding mode) or null. Selection styling still wins in CSS. */
     setColors(map) {
       colors = map;
       for (const [id, cells] of idIndex) {
         const col = map ? map.get(id) : undefined;
         for (const cell of cells) {
           if (cell._ec === col) continue;
           if (col) cell.style.setProperty('--ec', col);
           else cell.style.removeProperty('--ec');
           cell.classList.toggle('ec', !!col);
           cell._ec = col;
           cell._cls = cell.className;
         }
       }
     },
     /** Faint preview of nearest-neighbour positions (Set of ids) or null. */
     setNeighbors(ids) {
       const next = ids ?? new Set();
       const touched = new Set([...nn, ...next]);
       nn = next;
       for (const id of touched) {
         for (const cell of idIndex.get(id) ?? []) {
           cell.classList.toggle('nn', nn.has(id));
           cell._cls = cell.className;
         }
       }
     },
    idAt(row, col) { return cellAt({ row, col })?._id ?? null; },
    get cols() { return cols; },
    get rowCount() { return n; },
    metrics,
  };
}