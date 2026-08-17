import { qs, fitCanvas } from '../util/dom.js';
import { INK } from '../util/colors.js';
import { fmt } from '../util/format.js';

let canvas = null,
  info = null;

export function mount() {
  canvas = qs('#gapCanvas');
  info = qs('#gapInfo');
}

export function render(stack) {
  const { ctx, w, h } = fitCanvas(canvas, 230);
  ctx.fillStyle = '#0a0d13';
  ctx.fillRect(0, 0, w, h);

  const pos = stack.survivorPositions;
  if (pos.length < 3) {
    info.textContent = 'not enough survivors in this window';
    return;
  }

  const gaps = [];
  for (let i = 1; i < pos.length; i++) gaps.push(pos[i] - pos[i - 1]);
  const maxGap = Math.max(...gaps);
  const cap = Math.min(maxGap, 48);
  const hist = new Array(cap + 2).fill(0); // last bucket = overflow
  for (const g of gaps) hist[g <= cap ? g : cap + 1]++;
  const hiCount = Math.max(...hist);

  const left = 34,
    right = 8,
    top = 12,
    bottom = 22;
  const plotW = w - left - right,
    plotH = h - top - bottom;
  const bw = plotW / (cap + 2);

  for (let g = 0; g <= cap + 1; g++) {
    const c = hist[g];
    if (!c) continue;
    const bh = (c / hiCount) * plotH;
    ctx.fillStyle = g === cap + 1 ? INK.warn : `rgba(110,231,255,${0.35 + (0.65 * c) / hiCount})`;
    ctx.fillRect(left + g * bw, top + plotH - bh, Math.max(1, bw - 1), bh);
  }

  ctx.strokeStyle = INK.grid;
  ctx.strokeRect(left, top, plotW, plotH);
  ctx.fillStyle = INK.text;
  ctx.font = '9.5px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const stride = Math.ceil((cap + 2) / 12);
  for (let g = 0; g <= cap + 1; g += stride) {
    ctx.fillText(g === cap + 1 ? `>${cap}` : String(g), left + (g + 0.5) * bw, h - 7);
  }
  ctx.textAlign = 'right';
  ctx.fillText(String(hiCount), left - 4, top + 8);
  ctx.textAlign = 'left';

  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  info.textContent =
    `survivors ${pos.length} · mean gap ${fmt(mean, 3)} · predicted 1/ρ_k = ${fmt(1 / stack.rho, 3)} · ` +
    `max gap ${maxGap} (Jacobsthal-like: longest run of destructive interference)`;
}
