import { qs, fitCanvas } from '../util/dom.js';
import { primeColor, INK } from '../util/colors.js';
import { primeComb, dcTerm } from '../core/spectrum.js';
import { sci, fmt } from '../util/format.js';

let canvas = null, info = null, lines = [], baseInfo = '';

export function mount() {
  canvas = qs('#spectrumCanvas');
  info = qs('#spectrumInfo');
  canvas.addEventListener('mousemove', ev => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    let best = null, bd = Infinity;
    for (const L of lines) { const d = Math.abs(L.x - x); if (d < bd) { bd = d; best = L; } }
    if (best && bd < 7) {
      info.textContent =
        `frequency ${best.m}/${best.p} = ${(best.m / best.p).toFixed(8)} ∈ ℚ/ℤ` +
        `   |M̂_${best.p}| = 1/${best.p} = ${(1 / best.p).toFixed(8)}` +
        `   owner: prime ${best.p} (stage k=${best.stage})`;
    } else info.textContent = baseInfo;
  });
  canvas.addEventListener('mouseleave', () => { info.textContent = baseInfo; });
}

export function render(stack, state) {
  const { ctx, w, h } = fitCanvas(canvas, 250);
  const left = 52, right = 14, top = 16, bottom = 30;
  const plotW = w - left - right, plotH = h - top - bottom;
  lines = [];

  ctx.fillStyle = '#0a0d13';
  ctx.fillRect(0, 0, w, h);

  // ---- amplitude scale ----
  const amps = stack.basis.map(p => 1 / p);
  const aMax = 0.5;
  const aMin = Math.min(...amps, 0.5) / 2;
  const scale = a => {
    if (state.logSpectrum) {
      const t = (Math.log10(a) - Math.log10(aMin)) / (Math.log10(aMax) - Math.log10(aMin));
      return Math.max(0, Math.min(1, t));
    }
    return Math.sqrt(Math.max(0, a) / 1);           // sqrt keeps small primes visible
  };
  const yOf = v => top + plotH - v * plotH;

  // ---- grid: notable rationals ----
  ctx.strokeStyle = INK.grid;
  ctx.fillStyle = INK.text;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (const [num, den] of [[0, 1], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [1, 1]]) {
    const f = num / den;
    const x = left + f * plotW;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
    ctx.fillText(den === 1 ? String(num) : `${num}/${den}`, x, top + plotH + 14);
  }
  ctx.textAlign = 'left';
  ctx.fillText('frequency in ℚ/ℤ  →', left, h - 4);

  // ---- amplitude axis ticks ----
  ctx.textAlign = 'right';
  for (const a of [0.5, 1 / 3, 0.2, 0.1, 0.05, 0.02, 0.01]) {
    if (a > aMax || a < aMin) continue;
    const y = yOf(scale(a));
    ctx.strokeStyle = 'rgba(35,44,61,0.7)';
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke();
    ctx.fillStyle = INK.text;
    ctx.fillText(a >= 0.1 ? a.toFixed(2) : a.toFixed(3), left - 6, y + 3);
  }
  ctx.textAlign = 'left';

  // ---- per-prime nonzero combs (disjoint supports) ----
  for (const st of stack.stages) {
    const comb = primeComb(st.p, 3000);
    const selected = st.index === state.selected;
    const y0 = top + plotH;
    const y1 = yOf(scale(comb.amp));
    ctx.strokeStyle = primeColor(st.index, selected ? 1 : 0.55);
    ctx.lineWidth = selected ? 1.8 : 1;
    ctx.beginPath();
    for (const { m, f } of comb.freqs) {
      const x = left + f * plotW;
      ctx.moveTo(x, y0); ctx.lineTo(x, y1);
      if (comb.freqs.length < 400) lines.push({ x, m, p: st.p, stage: st.stage });
    }
    ctx.stroke();
    // amplitude ledger on the right for the selected prime
    if (selected) {
      ctx.fillStyle = primeColor(st.index, 1);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(`p=${st.p}: ${comb.lines} lines @ 1/${st.p}`, left + 6, y1 - 5);
    }
  }

  // ---- the shared DC term ----
  const dc = dcTerm(stack.basis);
  const xdc = left;
  ctx.strokeStyle = INK.dc;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(xdc, top + plotH);
  ctx.lineTo(xdc, yOf(scale(Math.min(dc, aMax))));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.fillStyle = INK.dc;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`DC (shared) = ρ_k = ${sci(dc, 4)}`, xdc + 6, top + 11);

  const totalLines = stack.stages.reduce((a, s) => a + s.combLines, 0);
  const totalPower = stack.stages.reduce((a, s) => a + s.nonzeroPower, 0);
  baseInfo =
    `nonzero harmonics owned: ${totalLines}   Σ nonzero power = ${fmt(totalPower, 5)}   ` +
    `dual group order = L_k ≈ 10^${fmt(stack.log10L, 3)}   ` +
    `hover a line for its (m/p, amplitude, owner)`;
  info.textContent = baseInfo;
}