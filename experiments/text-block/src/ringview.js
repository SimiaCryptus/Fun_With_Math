import { glyphOf, PALETTE_SIZE } from './render.js';

/**
 * Read-only view of the text ring, one span per ring position (keyed by stable id).
 * Mirrors selection / hover from the store, and forwards clicks and hover back.
 */
export function createRingView(root, { onSelect, onHover, onClear } = {}) {
  if (!root) {
    console.warn('ringview: #ring-view element not found; ring strip disabled.');
    return { sync() {}, highlights() {} };
  }
  let cells = new Map(); // id -> span
  let sel = new Set();
  let hover = null;

  function apply(cell, id) {
    const on = sel.has(id);
    cell.classList.toggle('sel', on);
    for (let i = 0; i < PALETTE_SIZE; i++) cell.classList.toggle(`h${i}`, on && id % PALETTE_SIZE === i);
    cell.classList.toggle('hover', hover === id);
  }

  function sync(ring, state) {
    const frag = document.createDocumentFragment();
    cells = new Map();
    ring.forEach((c, p) => {
      const s = document.createElement('span');
      s.className = c.sentinel ? 'rv-cell sentinel' : 'rv-cell';
      s.textContent = glyphOf(c.ch);
      s.dataset.id = c.id;
      s._id = c.id;
      s.title = `pos ${p}`;
      frag.append(s);
      cells.set(c.id, s);
    });
    root.replaceChildren(frag);
    sel = state.selection;
    hover = state.hover;
    for (const [id, cell] of cells) apply(cell, id);
  }

  function highlights(state) {
    const nextSel = state.selection;
    const nextHover = state.hover;
    const touched = new Set();
    const added = [];
    for (const id of sel) if (!nextSel.has(id)) touched.add(id);
    for (const id of nextSel) {
      if (!sel.has(id)) {
        touched.add(id);
        added.push(id);
      }
    }
    if (hover !== nextHover) {
      if (hover != null) touched.add(hover);
      if (nextHover != null) touched.add(nextHover);
    }
    sel = nextSel;
    hover = nextHover;
    for (const id of touched) {
      const cell = cells.get(id);
      if (cell) apply(cell, id);
    }
    // Keep the most recently added selection visible in a long ring.
    const last = added.length ? cells.get(added[added.length - 1]) : undefined;
    if (last && root.offsetParent !== null) {
      // root is position: relative, so offsetLeft is measured from its padding edge.
      const l = last.offsetLeft;
      if (l < root.scrollLeft || l + last.offsetWidth > root.scrollLeft + root.clientWidth) {
        root.scrollLeft = Math.max(0, l - root.clientWidth / 2);
      }
    }
  }

  const idOf = (e) => e.target.closest?.('.rv-cell')?._id ?? null;

  root.addEventListener('click', (e) => {
    const id = idOf(e);
    if (id == null) onClear?.();
    else if (cells.has(id)) onSelect?.(id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    onHover?.(idOf(e));
  });
  root.addEventListener('pointerleave', () => onHover?.(null));

  return { sync, highlights };
}