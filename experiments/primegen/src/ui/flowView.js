import { qs, fitCanvas } from '../util/dom.js';
import { primeColor, INK } from '../util/colors.js';
import { fmt } from '../util/format.js';

let canvas = null;

export function mount() { canvas = qs('#flowCanvas'); }

export function render(stack, state) {
  const { ctx, w, h } = fitCanvas(canvas, 330);
  ctx.fillStyle = '#0a0d13';
  ctx.fillRect(0, 0, w, h);
  const stages = stack.stages;
  if (!stages.length) return;

  const gap = 18;
  const top = { x: 52, y: 16, w: w - 66, h: (h - 2 * 16 - gap) / 2 };
  const bot = { x: 52, y: top.y + top.h + gap, w: top.w, h: top.h };

  drawDensity(ctx, stages, top, state);
  drawEntropy(ctx, stages, bot, state);
}

function frame(ctx, r, title) {
  ctx.strokeStyle = INK.grid;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = INK.text;
  ctx.font = '10.5px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(title, r.x + 6, r.y + 12);
}

function xAt(r, i, n) { return r.x + (n === 1 ? r.w / 2 : (i / (n - 1)) * r.w); }

function drawDensity(ctx, stages, r, state) {
  frame(ctx, r, 'ρ_k = Π(1−1/p_i)   [log10 scale]   ·   dashed: e^{−γ}/log p_k');
  const vals = stages.map(s => Math.log10(s.rho));
  const asym = stages.map(s => Math.log10(s.mertensAsym));
  const lo = Math.min(...vals, ...asym) - 0.05;
  const hi = 0.02;
  const yOf = v => r.y + r.h * (1 - (v - lo) / (hi - lo));

  // gridlines / labels
  ctx.textAlign = 'right';
  ctx.font = '10px ui-monospace, monospace';
  for (let t = 0; t <= 4; t++) {
    const v = lo + (hi - lo) * t / 4;
    const y = yOf(v);
    ctx.strokeStyle = 'rgba(31,39,58,0.9)';
    ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
    ctx.fillStyle = INK.text;
    ctx.fillText(`10^${v.toFixed(2)}`, r.x - 6, y + 3);
  }

  // asymptotic
  ctx.strokeStyle = 'rgba(255,207,139,0.8)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  stages.forEach((s, i) => {
    const x = xAt(r, i, stages.length), y = yOf(asym[i]);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // exact product
  ctx.strokeStyle = '#6ee7ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  stages.forEach((s, i) => {
    const x = xAt(r, i, stages.length), y = yOf(vals[i]);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;

  stages.forEach((s, i) => {
    const x = xAt(r, i, stages.length), y = yOf(vals[i]);
    ctx.fillStyle = primeColor(i, i === state.selected ? 1 : 0.85);
    ctx.beginPath(); ctx.arc(x, y, i === state.selected ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
  });

  axisLabels(ctx, stages, r);
}

function drawEntropy(ctx, stages, r, state) {
  frame(ctx, r, 'H_joint(k) = Σ H(p_i)  (line, bits)   ·   ΔH = H(p_k)  (bars, bits)');
  const hi = stages[stages.length - 1].Hjoint * 1.12 || 1;
  const yOf = v => r.y + r.h * (1 - v / hi);

  ctx.textAlign = 'right';
  ctx.font = '10px ui-monospace, monospace';
  for (let t = 0; t <= 4; t++) {
    const v = hi * t / 4, y = yOf(v);
    ctx.strokeStyle = 'rgba(31,39,58,0.9)';
    ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
    ctx.fillStyle = INK.text;
    ctx.fillText(v.toFixed(2), r.x - 6, y + 3);
  }

  // ΔH bars, scaled to be visible against the cumulative curve
  const dhMax = Math.max(...stages.map(s => s.H));
  const barScale = (r.h * 0.55) / (dhMax || 1);
  const bw = Math.max(2, r.w / stages.length - 3);
  stages.forEach((s, i) => {
    const x = xAt(r, i, stages.length);
    const bh = s.H * barScale;
    ctx.fillStyle = primeColor(i, i === state.selected ? 0.95 : 0.4);
    ctx.fillRect(x - bw / 2, r.y + r.h - bh, bw, bh);
  });

  // cumulative joint entropy
  ctx.strokeStyle = INK.alive;
  ctx.lineWidth = 2;
  ctx.beginPath();
  stages.forEach((s, i) => {
    const x = xAt(r, i, stages.length), y = yOf(s.Hjoint);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;

  // entropy density annotation (log10 h_k)
  const last = stages[stages.length - 1];
  ctx.fillStyle = INK.text;
  ctx.textAlign = 'right';
  ctx.fillText(`h_k ≈ 10^${fmt(last.log10EntropyDensity, 2)} bits/integer`, r.x + r.w - 6, r.y + 12);

  axisLabels(ctx, stages, r);
}

function axisLabels(ctx, stages, r) {
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.text;
  ctx.font = '9.5px ui-monospace, monospace';
  const stride = Math.ceil(stages.length / 13);
  stages.forEach((s, i) => {
    if (i % stride) return;
    ctx.fillText(String(s.p), xAt(r, i, stages.length), r.y + r.h + 12);
  });
}