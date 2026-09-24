/**
 * Glyph flicker ("digital rain" settle) and FLIP row slides.
 * Both are disabled under prefers-reduced-motion.
 */

const mq = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

export const reducedMotion = () => mq.matches;

const RAIN = Array.from('ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789:.=*+-<>¦');
const active = new Map(); // cell -> { until, next }
let raf = 0;

function schedule() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(t) {
  for (const [cell, st] of active) {
    if (t >= st.until) {
      cell.textContent = cell._glyph;
      delete cell.dataset.fx;
      active.delete(cell);
    } else if (t >= st.next) {
      cell.textContent = RAIN[(Math.random() * RAIN.length) | 0];
      st.next = t + 50;
    }
  }
  raf = active.size ? requestAnimationFrame(tick) : 0;
}

/**
 * Set the glyph of a cell. With `flicker`, the cell cycles a few random glyphs first.
 * Any pending flicker is cancelled by a non-flicker set.
 */
export function setGlyph(cell, glyph, flicker = false) {
  const prev = cell._glyph;
  cell._glyph = glyph;
  if (flicker && !mq.matches) {
    active.set(cell, { until: performance.now() + 140 + Math.random() * 180, next: 0 });
    cell.dataset.fx = '';
    schedule();
    return;
  }
  if (active.delete(cell)) {
    delete cell.dataset.fx;
    cell.textContent = glyph;
    return;
  }
  if (prev !== glyph) cell.textContent = glyph;
}

/** FLIP: entries = [{ el, dy }] where dy = oldTop - newTop (after the DOM move). */
export function flipRows(entries, container) {
  if (!entries.length || mq.matches) return;
  for (const { el, dy } of entries) {
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
  }
  void container.offsetHeight; // commit the inverted positions
  for (const { el } of entries) {
    el.style.transition = '';
    el.style.transform = '';
  }
}