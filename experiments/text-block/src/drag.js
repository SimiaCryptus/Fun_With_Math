/**
 * Pointer-events horizontal drag with click-vs-drag threshold.
 * Movement below `threshold` px counts as a click (reported on pointerup).
 * Touch gestures that start mostly vertical are left to native scrolling.
 */
export function attachDrag(el, { onStart, onMove, onEnd, onClick }, { threshold = 4 } = {}) {
  let down = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target === el && e.offsetX >= el.clientWidth) return; // vertical scrollbar
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, dx: 0 };
  });

  el.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!down.dragging) {
      if (Math.hypot(dx, dy) < threshold) return;
      if (e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) {
        down = null; // let the browser scroll vertically
        return;
      }
      down.dragging = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      onStart?.(e);
    }
    down.dx = dx;
    onMove?.(dx, e);
  });

  const finish = (e, cancelled) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    if (d.dragging) {
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      onEnd?.(cancelled ? d.dx : e.clientX - d.x, e);
    } else if (!cancelled) {
      onClick?.(e);
    }
  };

  el.addEventListener('pointerup', (e) => finish(e, false));
  el.addEventListener('pointercancel', (e) => finish(e, true));

  return {
    get dragging() { return !!down?.dragging; },
  };
}