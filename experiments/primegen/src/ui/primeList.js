import { qs, el, fitCanvas } from '../util/dom.js';
import { primeColor } from '../util/colors.js';
import { fmt, sci, fromLog10, bigStr } from '../util/format.js';

let host = null, app = null;

export function mount(ctx) {
  app = ctx;
  host = qs('#primeList');
}

export function render(stack, state) {
  host.innerHTML = '';
  const stripLen = Math.min(stack.N, 210);

  for (const st of stack.stages) {
    const row = el('div', { class: 'prime-row' + (st.index === state.selected ? ' selected' : '') });
    row.style.setProperty('--pc', primeColor(st.index));
    row.addEventListener('click', () => app.onSelect(st.index));

    row.appendChild(el('div', { class: 'pr-id' }, [
      el('span', { class: 'pr-k' }, [`k = ${st.stage}`]),
      el('span', { class: 'pr-p' }, [String(st.p)]),
      el('span', { class: 'pr-k' }, [`L_k = ${bigStr(st.L)}`]),
    ]));

    const cPeriod = el('canvas', { class: 'strip' });
    const cOrtho = el('canvas', { class: 'strip' });
    row.appendChild(el('div', { class: 'pr-strips' }, [
      el('div', { class: 'strip-wrap' }, [
        el('span', { class: 'slabel' }, [`M_${st.p} — native period ${st.p}, one dead class`]),
        cPeriod,
      ]),
      el('div', { class: 'strip-wrap' }, [
        el('span', { class: 'slabel' },
          [`C_${st.stage} — orthogonal new kills on n = ${stack.start}…${stack.start + stripLen - 1}`]),
        cOrtho,
      ]),
    ]));

    row.appendChild(metricsBlock(st, stack));
    host.appendChild(row);

    drawPeriod(cPeriod, st);
    drawOrtho(cOrtho, st, stack, stripLen);
  }
}

function metric(k, v, title) {
  return el('div', { class: 'm', title: title || '' }, [
    el('span', { class: 'mk' }, [k]),
    el('span', { class: 'mv' }, [v]),
  ]);
}

function metricsBlock(st, stack) {
  return el('div', { class: 'pr-metrics' }, [
    metric('×(1−1/p)', fmt(st.factor, 6), 'attenuation factor of this filter stage'),
    metric('ρ_k', sci(st.rho, 5), 'cumulative survivor density (Mertens product)'),
    metric('ρ_{k−1}/p', sci(st.killDensity, 5), 'natural density of the orthogonal kill set C_k'),
    metric('ΔH', `${fmt(st.H, 4)} b`, 'marginal entropy injected by this prime (bits)'),
    metric('H_joint', `${fmt(st.Hjoint, 4)} b`, 'additive joint entropy of per-prime indicators'),
    metric('h_k', fromLog10(st.log10EntropyDensity), 'joint entropy per integer of the period'),
    metric('log10 L_k', fmt(st.log10L, 3), 'period length (primorial) in decimal digits'),
    metric('comb', `${st.combLines} @ 1/${st.p}`, 'nonzero harmonics owned by this prime and their amplitude'),
    metric('power≠0', sci(st.nonzeroPower, 4), 'total nonzero spectral power (p−1)/p²'),
    metric('C_k in win', `${st.newKills} (${fmt(100 * st.windowKillDensity, 3)}%)`, 'measured orthogonal kills in the window'),
    metric('alive after', `${st.aliveAfter} (${fmt(100 * st.windowAliveDensity, 3)}%)`, 'survivors after this stage, in the window'),
    metric('Mertens ~', sci(st.mertensAsym, 4), 'e^{-γ}/log p, the asymptotic for ρ_k'),
  ]);
}

function drawPeriod(canvas, st) {
  const { ctx, w, h } = fitCanvas(canvas, 16);
  const p = st.p;
  const cw = w / p;
  ctx.fillStyle = '#0e1320';
  ctx.fillRect(0, 0, w, h);
  for (let r = 0; r < p; r++) {
    ctx.fillStyle = r === 0 ? '#ff6b81' : primeColor(st.index, 0.35);
    ctx.fillRect(r * cw, 0, Math.max(0.6, cw - (cw > 3 ? 1 : 0)), h);
  }
  if (cw > 8) {
    ctx.fillStyle = '#05070b';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', cw / 2, h - 4);
  }
}

function drawOrtho(canvas, st, stack, len) {
  const { ctx, w, h } = fitCanvas(canvas, 16);
  const cw = w / len;
  ctx.fillStyle = '#0e1320';
  ctx.fillRect(0, 0, w, h);
  for (let idx = 0; idx < len; idx++) {
    const s = stack.stageOf[idx];
    let color;
    if (s === st.stage) color = primeColor(st.index, 1);            // C_k
    else if (s !== 0 && s < st.stage) color = '#39425a';            // already dead
    else color = 'rgba(183,247,208,0.35)';                          // still alive at stage k
    ctx.fillStyle = color;
    ctx.fillRect(idx * cw, 0, Math.max(0.7, cw), h);
  }
}