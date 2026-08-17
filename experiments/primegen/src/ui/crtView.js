import { qs, el, fitCanvas } from '../util/dom.js';
import { primeColor, INK } from '../util/colors.js';
import { fmt } from '../util/format.js';

let canvas = null,
  selX = null,
  selY = null,
  info = null,
  app = null;
let ix = 0,
  iy = 1,
  lastSelected = -1,
  last = null;

export function mount(ctx) {
  app = ctx;
  canvas = qs('#crtCanvas');
  selX = qs('#crtX');
  selY = qs('#crtY');
  info = qs('#crtInfo');
  selX.addEventListener('change', () => {
    ix = +selX.value;
    redraw();
  });
  selY.addEventListener('change', () => {
    iy = +selY.value;
    redraw();
  });
}

function redraw() {
  if (last) draw(last.stack, last.state);
}

export function render(stack, state) {
  last = { stack, state };
  const n = stack.basis.length;
  if (state.selected !== lastSelected) {
    lastSelected = state.selected;
    ix = state.selected;
    iy = n > 1 ? (state.selected + 1) % n : 0;
  }
  ix = Math.min(ix, n - 1);
  iy = Math.min(iy, n - 1);
  populate(selX, stack.basis, ix);
  populate(selY, stack.basis, iy);
  draw(stack, state);
}

function populate(sel, basis, value) {
  sel.innerHTML = '';
  basis.forEach((p, i) => sel.appendChild(el('option', { value: String(i) }, [`p = ${p}`])));
  sel.value = String(value);
}

function draw(stack, state) {
  const p = stack.basis[ix],
    q = stack.basis[iy];
  const { ctx, w, h } = fitCanvas(canvas, 230);
  ctx.fillStyle = '#0a0d13';
  ctx.fillRect(0, 0, w, h);
  const pad = 16;
  const plotW = w - 2 * pad,
    plotH = h - 2 * pad;
  const cw = plotW / p,
    ch = plotH / q;

  for (let a = 0; a < p; a++) {
    for (let b = 0; b < q; b++) {
      const deadP = a === 0,
        deadQ = b === 0;
      let color;
      if (deadP && deadQ) color = '#ffffff';
      else if (deadP) color = primeColor(ix, 0.95);
      else if (deadQ) color = primeColor(iy, 0.95);
      else color = 'rgba(183,247,208,0.28)';
      ctx.fillStyle = color;
      ctx.fillRect(
        pad + a * cw,
        pad + b * ch,
        Math.max(0.7, cw - (cw > 4 ? 1 : 0)),
        Math.max(0.7, ch - (ch > 4 ? 1 : 0))
      );
    }
  }
  ctx.strokeStyle = INK.grid;
  ctx.strokeRect(pad, pad, plotW, plotH);
  ctx.fillStyle = INK.text;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`n mod ${p} →`, pad, h - 4);
  ctx.save();
  ctx.translate(10, pad + plotH);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`n mod ${q} →`, 0, 0);
  ctx.restore();

  const alive = (p - 1) * (q - 1);
  info.textContent =
    `alive = (p−1)(q−1) = ${alive} of pq = ${p * q}  ⇒  ` +
    `(1−1/${p})(1−1/${q}) = ${fmt(alive / (p * q), 6)}  —  ` +
    `each mask depends on one coordinate only: independence is structural, not assumed.`;
}
