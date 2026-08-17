import { qs, fitCanvas } from '../util/dom.js';
import { primeColor, INK } from '../util/colors.js';

let canvas = null,
  tip = null,
  geom = null,
  lastStack = null;

export function mount() {
  canvas = qs('#stackCanvas');
  tip = qs('#stackTip');
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', () => tip.classList.remove('on'));
}

export function render(stack, state) {
  lastStack = stack;
  const rows = stack.basis.length + 1;
  const rowH = rows <= 12 ? 20 : Math.max(8, Math.floor(260 / rows));
  const padT = 14,
    padB = 20,
    left = 62,
    right = 10;
  const height = padT + padB + rows * rowH;

  const { ctx, w, h } = fitCanvas(canvas, height);
  const plotW = Math.max(20, w - left - right);
  geom = { left, right, padT, rowH, plotW, rows, N: stack.N, start: stack.start };

  ctx.fillStyle = '#0a0d13';
  ctx.fillRect(0, 0, w, h);

  const cellW = plotW / stack.N;
  const crisp = cellW >= 3;

  if (crisp) drawCrisp(ctx, stack, state, geom, cellW);
  else drawDensity(ctx, stack, state, geom);

  // row labels + selection highlight
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < rows; i++) {
    const y = padT + i * rowH;
    const isSurv = i === rows - 1;
    if (!isSurv && i === state.selected) {
      ctx.fillStyle = 'rgba(110,231,255,0.10)';
      ctx.fillRect(left - 2, y, plotW + 2, rowH);
    }
    ctx.fillStyle = isSurv ? INK.alive : primeColor(i, 0.95);
    ctx.fillText(isSurv ? 'alive' : `p=${stack.basis[i]}`, left - 8, y + rowH / 2);
  }

  // n-axis ticks
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.text;
  ctx.font = '10px ui-monospace, monospace';
  const yTick = padT + rows * rowH + 12;
  for (let t = 0; t <= 4; t++) {
    const frac = t / 4;
    const n = stack.start + Math.round(frac * (stack.N - 1));
    ctx.fillText(String(n), left + frac * plotW, yTick);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = INK.text;
  ctx.fillText(`window = ${stack.N} integers · survivors = ${stack.survivors}`, left, padT - 5);
}

function drawCrisp(ctx, stack, state, g, cellW) {
  const gap = cellW > 5 ? 1 : 0;
  for (let i = 0; i < stack.basis.length; i++) {
    const p = stack.basis[i];
    const y = g.padT + i * g.rowH;
    // faint raw periodic field M_p
    if (state.showRaw) {
      ctx.fillStyle = primeColor(i, 0.16);
      const first = Math.ceil(stack.start / p) * p;
      for (let n = first; n < stack.start + stack.N; n += p) {
        ctx.fillRect(g.left + (n - stack.start) * cellW, y, Math.max(1, cellW - gap), g.rowH - 1);
      }
    }
    // bright orthogonal component C_k
    ctx.fillStyle = primeColor(i, 1);
    for (let idx = 0; idx < stack.N; idx++) {
      if (stack.stageOf[idx] !== i + 1) continue;
      ctx.fillRect(g.left + idx * cellW, y, Math.max(1, cellW - gap), g.rowH - 1);
    }
  }
  // survivors
  const y = g.padT + stack.basis.length * g.rowH;
  ctx.fillStyle = INK.alive;
  for (let idx = 0; idx < stack.N; idx++) {
    if (stack.stageOf[idx] !== 0) continue;
    ctx.fillRect(g.left + idx * cellW, y, Math.max(1, cellW - gap), g.rowH - 1);
  }
}

function drawDensity(ctx, stack, state, g) {
  const px = Math.max(1, Math.floor(g.plotW));
  const rows = g.rows;
  const acc = Array.from({ length: rows }, () => new Float32Array(px));
  const cnt = new Float32Array(px);
  for (let idx = 0; idx < stack.N; idx++) {
    const x = Math.min(px - 1, ((idx * px) / stack.N) | 0);
    cnt[x]++;
    const s = stack.stageOf[idx];
    acc[s === 0 ? rows - 1 : s - 1][x]++;
  }
  for (let i = 0; i < rows; i++) {
    const y = g.padT + i * g.rowH;
    const surv = i === rows - 1;
    // per-row normalization so sparse late primes stay visible
    let mx = 0;
    for (let x = 0; x < px; x++) if (cnt[x]) mx = Math.max(mx, acc[i][x] / cnt[x]);
    if (mx <= 0) mx = 1;
    for (let x = 0; x < px; x++) {
      if (!cnt[x]) continue;
      const v = acc[i][x] / cnt[x] / mx;
      if (v <= 0) continue;
      ctx.fillStyle = surv
        ? `rgba(183,247,208,${0.15 + 0.85 * v})`
        : primeColor(i, 0.15 + 0.85 * v);
      ctx.fillRect(g.left + x, y, 1, g.rowH - 1);
    }
  }
}

function onMove(ev) {
  if (!geom || !lastStack) return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left,
    y = ev.clientY - rect.top;
  if (x < geom.left || x > geom.left + geom.plotW) {
    tip.classList.remove('on');
    return;
  }
  const idx = Math.min(
    geom.N - 1,
    Math.max(0, Math.floor(((x - geom.left) / geom.plotW) * geom.N))
  );
  const n = geom.start + idx;
  const s = lastStack.stageOf[idx];
  const row = Math.floor((y - geom.padT) / geom.rowH);
  const rowLabel =
    row >= 0 && row < lastStack.basis.length
      ? `row: p = ${lastStack.basis[row]}`
      : 'row: survivors';
  const status =
    s === 0
      ? 'survivor (no basis prime divides it)'
      : `first killed at stage ${s} by p = ${lastStack.killer[idx]}  ⇒ n ∈ C_${s}`;
  tip.textContent = `n = ${n}\n${status}\n${rowLabel}`;
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(24, y)}px`;
  tip.classList.add('on');
}
