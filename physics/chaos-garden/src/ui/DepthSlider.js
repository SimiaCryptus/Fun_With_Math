import { SCHEMA } from '../core/Params.js';
import { TIERS } from '../core/Tiers.js';
/** The centerpiece control (§9.2): log-scaled H with k_h ↔ geometric-scale crossover markers. */
const LG0 = Math.log10(SCHEMA.H.min), LG1 = Math.log10(SCHEMA.H.max);
const toH = (s) => 10 ** (LG0 + (s / 1000) * (LG1 - LG0)), toS = (H) => Math.round((Math.log10(H) - LG0) / (LG1 - LG0) * 1000);
export class DepthSlider {
  constructor(el, { params, bus, barrier }) {
    this.el = el; this.params = params; this.bus = bus; this.barrier = barrier; this.grid = null; this.scales = null;
    const opt = (k) => SCHEMA[k].values.map((v) => `<option>${v}</option>`).join('');
    el.innerHTML = `<div class="depth-main">
        <div class="H"><span>Depth H</span><input type="range" min="0" max="1000" data-k="H" aria-label="Slab aspect H"><output data-v="H"></output></div>
        <canvas class="markers" height="18" title="markers: k_h vs geometric scales (orange = obstacle sizes, cyan = gaps); band = crossover"></canvas>
      </div>
      <div class="depth-side">
        <label>Re <input type="number" data-k="Re" min="${SCHEMA.Re.min}" max="${SCHEMA.Re.max}" step="${SCHEMA.Re.step}" style="width:76px"></label>
        <label>inflow <select data-k="inflow">${opt('inflow')}</select></label>
        <label>y± <select data-k="spanwise">${opt('spanwise')}</select></label>
        <label>z± <select data-k="walls">${opt('walls')}</select></label>
        <label><input type="checkbox" data-k="twin"> twin</label>
        <label>tier <select data-k="tier">${opt('tier')}</select></label>
         <label>backend <select data-k="backend">${opt('backend')}</select></label>
        <span class="readout" data-v="info"></span>
        <span class="badge settle" data-v="settle">settling</span>
      </div>`;
    this.range = el.querySelector('[data-k=H]'); this.out = el.querySelector('[data-v=H]'); this.cv = el.querySelector('canvas');
    this.range.addEventListener('input', () => { this.out.value = toH(+this.range.value).toFixed(3); this.drawMarkers(toH(+this.range.value)); });
    this.range.addEventListener('change', () => params.set('H', +toH(+this.range.value).toFixed(4)));
    el.addEventListener('change', (e) => { const k = e.target.dataset.k; if (!k || k === 'H') return; params.set(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value); });
    bus.on('params:change', () => this.sync()); bus.on('design:change', () => this.refreshScales());
    this.sync();
  }
  setGrid(grid) { this.grid = grid; this.refreshScales(); }
  sync() {
    const p = this.params; this.range.value = toS(p.get('H')); this.out.value = p.get('H').toFixed(3);
     for (const k of ['Re', 'inflow', 'spanwise', 'walls', 'tier', 'backend']) this.el.querySelector(`[data-k=${k}]`).value = p.get(k);
    this.el.querySelector('[data-k=twin]').checked = p.get('twin'); this.drawMarkers(p.get('H'));
  }
  refreshScales() { if (!this.grid) return; this.scales = this.barrier.geometricScales(this.grid.hy); this.drawMarkers(this.params.get('H')); }
  setInfo({ grid, solver, tierName }) {
    const Re = this.params.get('Re'), Reh = Re * grid.H;
     const r = solver.report;
      const res = r.residual != null ? ` · res ${r.residual.toExponential(1)}` : '';
      this.el.querySelector('[data-v=info]').textContent = `${TIERS[tierName]?.label || tierName} · ${solver.backend} · ${grid.Nx}×${grid.Ny}×${grid.Nz}${grid.quasi2D ? ' (quasi-2D floor)' : ''} · Re_h ${Reh.toFixed(0)} · k_h ${grid.kh.toFixed(1)} · Δt ${solver.dt.toExponential(2)} · ${r.diffusion} · p-iters ${r.pIters}/${solver.pIters}${res}`;
  }
  setSettled(settled, progress) { const b = this.el.querySelector('[data-v=settle]'); b.textContent = settled ? 'measuring' : `settling ${(progress * 100).toFixed(0)}%`; b.classList.toggle('ok', settled); }
  /** Crossover: k_h = π/(H·Ly) equals k_ℓ = 2π/ℓ when H* = ℓ/(2·Ly). */
  drawMarkers(H) {
    const cv = this.cv, W = cv.clientWidth || 400, dpr = devicePixelRatio || 1; if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = 18 * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, 18);
    const X = (h) => (Math.log10(h) - LG0) / (LG1 - LG0) * W;
    const s = this.scales; const all = s ? [...s.gaps, ...s.obstacles].map((q) => q.scale / 2) : [];
    if (all.length) { const lo = Math.min(...all), hi = Math.max(...all); g.fillStyle = 'rgba(255,180,84,0.18)'; g.fillRect(X(Math.max(0.01, lo / 1.5)), 0, X(Math.min(1, hi * 1.5)) - X(Math.max(0.01, lo / 1.5)), 18); }
    if (s) { for (const q of s.obstacles) { g.fillStyle = `rgba(255,180,84,${0.4 + 0.6 * q.weight})`; g.fillRect(X(q.scale / 2) - 1, 2, 2, 14); } for (const q of s.gaps) { g.fillStyle = `rgba(108,196,255,${0.4 + 0.6 * q.weight})`; g.fillRect(X(q.scale / 2) - 1, 2, 2, 14); } }
    g.fillStyle = '#dfe3ea'; g.fillRect(X(H) - 1, 0, 2, 18);
    g.fillStyle = '#8a93a3'; g.font = '10px system-ui'; g.fillText('0.01', 2, 12); g.fillText('0.1', X(0.1) + 3, 12); g.fillText('1', W - 8, 12);
    const inBand = all.some((h) => Math.abs(Math.log10(h / H)) < 0.18);
    this.el.querySelector('.H span').textContent = inBand ? 'Depth H ⚠︎ k_h ↔ geometry' : 'Depth H';
  }
}