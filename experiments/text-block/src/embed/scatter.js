/**
 * Canvas scatter view: positions drawn as glyphs, pan (drag), zoom (wheel / pinch),
 * hover + tooltip, click selection (same semantics as the block), alt-drag lasso.
 */

const HIT = 12;
const CLICK = 4;
const FONT = '14px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function createScatter(canvas, { tip, onHover, onSelect, onClear, onLasso, tooltip } = {}) {
  const ctx = canvas.getContext('2d');
  let data = null;
  let message = '';
  let sel = new Set();
  let hover = null;
  let nn = new Set();
  let colors = null;
  let edges = null;
  let ext = 0;
  const view = { zoom: 1, px: 0, py: 0 };
  let W = 0;
  let H = 0;
  let dpr = 1;
  let pal = null;
  let raf = 0;
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let lasso = null;
  let localHover = false;

  function palette() {
    if (!pal) {
      const cs = getComputedStyle(document.documentElement);
      const get = (name, fb) => cs.getPropertyValue(name).trim() || fb;
      pal = {
        fg: get('--fg', '#00ff66'),
        h: [0, 1, 2, 3, 4, 5].map((i) => get(`--h${i}`, '#39ff88')),
      };
    }
    return pal;
  }

  function request() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width;
    H = r.height;
    dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(W * dpr));
    const h = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    request();
  }
  new ResizeObserver(resize).observe(canvas);

  const scale = () => (Math.max(10, Math.min(W, H) / 2 - 22) / (ext || 1)) * view.zoom;

  function toScreen() {
    const n = data.n;
    const s = scale();
    const cx = W / 2 + view.px;
    const cy = H / 2 + view.py;
    const out = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      out[2 * i] = cx + data.xy[2 * i] * s;
      out[2 * i + 1] = cy - data.xy[2 * i + 1] * s;
    }
    return out;
  }

  function hit(x, y) {
    if (!data || !data.n) return null;
    const sc = toScreen();
    let best = HIT * HIT;
    let idx = -1;
    for (let i = 0; i < data.n; i++) {
      const dx = sc[2 * i] - x;
      const dy = sc[2 * i + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        idx = i;
      }
    }
    return idx < 0 ? null : data.ids[idx];
  }

  function draw() {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const p = palette();
    const cx = W / 2 + view.px;
    const cy = H / 2 + view.py;

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0, 255, 102, .08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(W, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.stroke();

    if (!data || !data.n) {
      ctx.fillStyle = 'rgba(0, 255, 102, .5)';
      ctx.font = '13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(message || 'no embedding', W / 2, H / 2);
      return;
    }

    const sc = toScreen();
    const n = data.n;

    if (edges) {
      ctx.strokeStyle = p.fg;
      for (const [a, b, w] of edges) {
        if (a >= n || b >= n) continue;
        ctx.globalAlpha = 0.05 + 0.25 * w;
        ctx.beginPath();
        ctx.moveTo(sc[2 * a], sc[2 * a + 1]);
        ctx.lineTo(sc[2 * b], sc[2 * b + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const hi = hover != null ? data.index.get(hover) : undefined;
    if (hi !== undefined && nn.size) {
      ctx.strokeStyle = 'rgba(234, 255, 242, .35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (const id of nn) {
        const j = data.index.get(id);
        if (j === undefined) continue;
        ctx.moveTo(sc[2 * hi], sc[2 * hi + 1]);
        ctx.lineTo(sc[2 * j], sc[2 * j + 1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const dimOthers = nn.size > 0;
    for (let i = 0; i < n; i++) {
      const id = data.ids[i];
      if (sel.has(id)) continue;
      ctx.fillStyle = (colors && colors.get(id)) || p.fg;
      ctx.globalAlpha = dimOthers && !nn.has(id) && id !== hover ? 0.5 : 0.92;
      ctx.font = data.sentinel[i] ? `bold ${FONT}` : FONT;
      ctx.fillText(data.glyphs[i], sc[2 * i], sc[2 * i + 1]);
    }
    ctx.globalAlpha = 1;
    ctx.font = FONT;

    ctx.strokeStyle = 'rgba(0, 255, 102, .65)';
    for (const id of nn) {
      const j = data.index.get(id);
      if (j === undefined) continue;
      ctx.beginPath();
      ctx.arc(sc[2 * j], sc[2 * j + 1], 9, 0, 2 * Math.PI);
      ctx.stroke();
    }

    for (let i = 0; i < n; i++) {
      const id = data.ids[i];
      if (!sel.has(id)) continue;
      const col = p.h[id % p.h.length];
      const x = sc[2 * i];
      const y = sc[2 * i + 1];
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fff';
      ctx.fillText(data.glyphs[i], x, y);
      ctx.shadowBlur = 0;
    }

    if (hi !== undefined) {
      ctx.strokeStyle = '#eafff2';
      ctx.beginPath();
      ctx.arc(sc[2 * hi], sc[2 * hi + 1], 12, 0, 2 * Math.PI);
      ctx.stroke();
    }

    if (lasso && lasso.length > 1) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(234, 255, 242, .8)';
      ctx.fillStyle = 'rgba(0, 255, 102, .06)';
      ctx.beginPath();
      lasso.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function zoomAbout(base, f, mx, my) {
    const zoom = Math.min(40, Math.max(0.2, base.zoom * f));
    const k = zoom / base.zoom;
    view.zoom = zoom;
    view.px = mx - W / 2 - (base.mx - W / 2 - base.px) * k;
    view.py = my - H / 2 - (base.my - H / 2 - base.py) * k;
    request();
  }

  function hideTip() {
    if (tip) tip.hidden = true;
  }

  function showTip(id, x, y) {
    if (!tip) return;
    const text = id != null && tooltip ? tooltip(id) : '';
    if (!text) {
      hideTip();
      return;
    }
    tip.textContent = text;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.max(2, Math.min(x + 14, W - w - 4))}px`;
    tip.style.top = `${y + 14 + h > H ? Math.max(2, y - h - 10) : y + 14}px`;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: view.zoom, px: view.px, py: view.py,
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      };
      drag = null;
      lasso = null;
      return;
    }
    drag = { x, y, px: view.px, py: view.py, moved: false, lasso: e.altKey };
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const f = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.dist;
      zoomAbout(pinch, f, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (drag) {
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) >= CLICK) {
        drag.moved = true;
        hideTip();
        if (drag.lasso) lasso = [[drag.x, drag.y]];
      }
      if (!drag.moved) return;
      if (drag.lasso) lasso.push([x, y]);
      else {
        view.px = drag.px + dx;
        view.py = drag.py + dy;
      }
      request();
      return;
    }
    if (e.pointerType === 'touch') return;
    const id = hit(x, y);
    localHover = id != null;
    onHover?.(id);
    showTip(id, x, y);
  });

  function end(e, cancelled) {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      drag = null;
      return;
    }
    const d = drag;
    drag = null;
    if (!d) return;
    const [x, y] = local(e);
    if (d.lasso && d.moved) {
      if (!cancelled && lasso && data) {
        const sc = toScreen();
        const ids = [];
        for (let i = 0; i < data.n; i++) if (inside(lasso, sc[2 * i], sc[2 * i + 1])) ids.push(data.ids[i]);
        onLasso?.(ids);
      }
      lasso = null;
      request();
      return;
    }
    lasso = null;
    if (!d.moved && !cancelled) {
      const id = hit(x, y);
      if (id == null) onClear?.();
      else onSelect?.(id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
    }
  }
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));

  canvas.addEventListener('pointerleave', () => {
    if (drag) return;
    hideTip();
    if (localHover) {
      localHover = false;
      onHover?.(null);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    const f = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015));
    zoomAbout({ zoom: view.zoom, px: view.px, py: view.py, mx: x, my: y }, f, x, y);
  }, { passive: false });

  canvas.addEventListener('dblclick', () => {
    view.zoom = 1;
    view.px = 0;
    view.py = 0;
    request();
  });

  canvas.addEventListener('contextmenu', (e) => {
    if (e.ctrlKey) e.preventDefault();
  });

  return {
    setData(d, msg = '') {
      const fresh = !data || !d || data.n !== d.n;
      data = d ? { ...d, index: new Map(d.ids.map((id, i) => [id, i])) } : null;
      message = msg;
      if (data) {
        let m = 0;
        for (const v of data.xy) m = Math.max(m, Math.abs(v));
        m = m || 1;
        if (fresh || !ext) ext = m;
        else ext += (m - ext) * (m > ext ? 0.5 : 0.1);
      }
      request();
    },
    setSelection(s) { sel = s ?? new Set(); request(); },
    setHover(id) { hover = id; request(); },
    setNeighbors(s) { nn = s ?? new Set(); request(); },
    setColors(m) { colors = m; request(); },
    setEdges(e) { edges = e; request(); },
    resetView() { view.zoom = 1; view.px = 0; view.py = 0; request(); },
    redraw: request,
  };
}