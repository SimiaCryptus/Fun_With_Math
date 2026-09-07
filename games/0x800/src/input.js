// input.js — keyboard, pointer swipe and on-screen pad → direction names.
// Keys use `event.code` so the physical WEADZC hexagon survives any layout.

import { DIRS } from './hex.js';

const KEYS = {
  KeyD: 'E',
  KeyE: 'NE',
  KeyW: 'NW',
  KeyA: 'W',
  KeyZ: 'SW',
  KeyC: 'SE',
  Numpad6: 'E',
  Numpad9: 'NE',
  Numpad7: 'NW',
  Numpad4: 'W',
  Numpad1: 'SW',
  Numpad3: 'SE',
};

export const SWIPE_MIN = 24;

/** Direction name for a keydown event, or null. */
export function directionForKey(e) {
  if (KEYS[e.code]) return KEYS[e.code];
  switch (e.code) {
    case 'ArrowLeft':
      return 'W';
    case 'ArrowRight':
      return 'E';
    case 'ArrowUp':
      return e.shiftKey ? 'NE' : 'NW';
    case 'ArrowDown':
      return e.shiftKey ? 'SW' : 'SE';
    default:
      return null;
  }
}

/** Snap a screen-space vector (y down) to the nearest of the six directions. */
export function snapDirection(dx, dy) {
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  let best = DIRS[0];
  let bestDiff = Infinity;
  for (const d of DIRS) {
    let diff = Math.abs(angle - d.angle);
    diff = Math.min(diff, 360 - diff);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
}

export function attachInput({ onMove, onUndo, onNew, onHelp, onEscape }, { swipeEl }) {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (e.code === 'Escape') {
      onEscape?.();
      return;
    }
    if (e.metaKey || e.altKey) return;
    if (e.ctrlKey) {
      if (e.code === 'KeyZ') {
        e.preventDefault();
        onUndo?.();
      }
      return;
    }

    const d = directionForKey(e);
    if (d) {
      e.preventDefault();
      onMove(d);
      return;
    }

    if (e.code === 'KeyU') onUndo?.();
    else if (e.code === 'KeyR') onNew?.();
    else if (e.key === '?' || e.code === 'F1') {
      e.preventDefault();
      onHelp?.();
    }
  });

  // pointer swipe
  let start = null;
  swipeEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay, button, a')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      swipeEl.setPointerCapture(e.pointerId);
    } catch {
      /* not all browsers */
    }
  });
  swipeEl.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.hypot(dx, dy) < SWIPE_MIN) return;
    onMove(snapDirection(dx, dy).name);
  });
  swipeEl.addEventListener('pointercancel', () => {
    start = null;
  });
  swipeEl.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.overlay')) e.preventDefault();
  });
}

/** Build the hexagonal ring of six move buttons with undo in the middle. */
export function buildPad(padEl, { onMove, onUndo }) {
  const buttons = new Map();
  const shortKey = (d) => d.key.replace('Key', '');

  for (const d of DIRS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dir';
    b.dataset.dir = d.name;
    b.setAttribute('aria-label', `move ${d.label}`);
    b.title = `${d.label} (${shortKey(d)})`;
    const a = (d.angle * Math.PI) / 180;
    b.style.setProperty('--ax', Math.cos(a).toFixed(4));
    b.style.setProperty('--ay', Math.sin(a).toFixed(4));
    b.innerHTML = `<span class="glyph" aria-hidden="true">${d.glyph}</span><span class="key" aria-hidden="true">${shortKey(d)}</span>`;
    b.addEventListener('click', () => onMove(d.name));
    padEl.append(b);
    buttons.set(d.name, b);
  }

  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'undo';
  undo.setAttribute('aria-label', 'undo last move');
  undo.title = 'undo (U)';
  undo.innerHTML =
    '<span class="glyph" aria-hidden="true">↶</span><span class="key" aria-hidden="true">U</span>';
  undo.addEventListener('click', () => onUndo());
  padEl.append(undo);

  return {
    el: padEl,
    buttons,
    flash(name) {
      const b = buttons.get(name);
      if (!b) return;
      b.classList.remove('pressed');
      void b.offsetWidth;
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 140);
    },
    setUndoEnabled(on) {
      undo.disabled = !on;
    },
  };
}
