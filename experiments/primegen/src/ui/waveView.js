import { qs, fitCanvas } from '../util/dom.js';
import { primeColor, INK } from '../util/colors.js';
import { interferenceField, harmonicsForExactness } from '../core/spectrum.js';
import { fmt } from '../util/format.js';

let canvas = null,
  info = null;

export function mount() {
  canvas = qs('#waveCanvas');
  info = qs('#waveInfo');
}

export function render(stack, state) {
  const { ctx, w, h } = fitCanvas(canvas, 260);
  const left = 46,
    right = 12,
    top = 14,
    bottom = 26;
  const plotW = w - left - right,
    plotH = h - top - bottom;

  const count = Math.min(stack.N, state.waveWindow);
  const H = state.harmonics;
  const field = interferenceField(stack.basis, stack.start, count, H);

  const hi = Math.max(1.2, field.hi, Math.max(...field.exact) + 0.2);
  const lo = Math.min(-0.4, field.lo);
  const yOf = (v) => top + plotH * (1 - (v - lo) / (hi - lo));
  const xOf = (j) => left + (j + 0.5) * (plotW / count);

  ctx.fillStyle = '#0a0d13';
  ctx.fillRect(0, 0, w, h);

  // survivor bands (exact U = 0)
  ctx.fillStyle = 'rgba(183,247,208,0.10)';
  const cw = plotW / count;
  for (let j = 0; j < count; j++) {
    if (field.exact[j] === 0) ctx.fillRect(left + j * cw, top, Math.max(1, cw), plotH);
  }

  // exact integer field U(n) = #{p | n} as grey steps
  ctx.strokeStyle = 'rgba(135,148,173,0.55)';
  ctx.beginPath();
  for (let j = 0; j < count; j++) {
    const x = left + j * cw,
      y = yOf(field.exact[j]);
    ctx.moveTo(x, y);
    ctx.lineTo(x + cw, y);
  }
  ctx.stroke();

  // individual prime waves, faint
  for (let i = 0; i < stack.basis.length; i++) {
    const sel = i === state.selected;
    ctx.strokeStyle = primeColor(i, sel ? 0.95 : 0.22);
    ctx.lineWidth = sel ? 1.6 : 0.8;
    ctx.beginPath();
    const row = field.perPrime[i];
    for (let j = 0; j < count; j++) {
      const x = xOf(j),
        y = yOf(row[j]);
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // zero line
  ctx.strokeStyle = INK.axisLine;
  ctx.beginPath();
  ctx.moveTo(left, yOf(0));
  ctx.lineTo(left + plotW, yOf(0));
  ctx.stroke();

  // total interference field
  ctx.strokeStyle = '#6ee7ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let j = 0; j < count; j++) {
    const x = xOf(j),
      y = yOf(field.total[j]);
    j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.lineWidth = 1;

  // survivors marked on the zero line
  ctx.fillStyle = INK.alive;
  for (let j = 0; j < count; j++) {
    if (field.exact[j] !== 0) continue;
    ctx.beginPath();
    ctx.arc(xOf(j), yOf(0), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // axes
  ctx.fillStyle = INK.text;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let v = Math.ceil(lo); v <= Math.floor(hi); v++) {
    ctx.fillText(String(v), left - 6, yOf(v) + 3);
  }
  ctx.textAlign = 'center';
  for (let t = 0; t <= 4; t++) {
    const j = Math.round((t / 4) * (count - 1));
    ctx.fillText(String(stack.start + j), xOf(j), top + plotH + 15);
  }
  ctx.textAlign = 'left';

  const need = harmonicsForExactness(stack.basis);
  const err = maxAbsError(field, count);
  info.textContent =
    `H = ${H} harmonic pair(s) per prime · exact from H ≥ ${need} · ` +
    `max |U_H − U| = ${fmt(err, 5)} · survivors in view: ${countZeros(field, count)} · ` +
    `deep troughs = long prime gaps (constructive exclusion)`;
}

function maxAbsError(field, count) {
  let m = 0;
  for (let j = 0; j < count; j++) m = Math.max(m, Math.abs(field.total[j] - field.exact[j]));
  return m;
}
function countZeros(field, count) {
  let c = 0;
  for (let j = 0; j < count; j++) if (field.exact[j] === 0) c++;
  return c;
}
