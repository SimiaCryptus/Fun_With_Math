import { SYSTEMS } from './config/systems.js';
import { DEFAULTS } from './config/defaults.js';
import { lagrangePoints } from './core/lagrange.js';
import { hillRadius, CORE_VERSION, LABEL } from './core/conventions.js';
import { FIELD_NAMES, NF, createGrid, xiAt, nearestIndex } from './core/grid.js';
import { postprocess } from './core/differential.js';
import { propagate } from './core/encounter.js';
import { inertialVel } from './core/cr3bp.js';
import { patchedConicPredict } from './core/patchedConic.js';
import { WorkerPool } from './compute/workerPool.js';
import { SplitRenderer } from './render/renderer.js';
import { PhysicalView } from './render/physicalView.js';
import { ManifoldView } from './render/manifoldView.js';
import { SCALAR_LAYERS, colorize, ringColors } from './render/colormaps.js';

const $ = (id) => document.getElementById(id);
const R = new SplitRenderer($('view'));
const phys = new PhysicalView(), man = new ManifoldView();
R.add(phys); R.add(man);
const pool = new WorkerPool(new URL('./compute/encounterWorker.js', import.meta.url));
const cache = new Map();
const S = { grid: null, lps: null, sel: null };

for (const [k, s] of Object.entries(SYSTEMS)) $('system').add(new Option(s.name, k));
for (const [k, L] of Object.entries(SCALAR_LAYERS)) $('scalar').add(new Option(L.name, k));
$('scalar').value = 'dE';

function params() {
  const sys = SYSTEMS[$('system').value];
  const rho = hillRadius(sys.mu) * +$('rhoFactor').value;
  return {
    system: $('system').value, mu: sys.mu, C: +$('Cnum').value, rho, rhoFar: rho * +$('kFar').value,
    Rbody: sys.Rbody, T: +$('T').value, rtol: +$('rtol').value, atol: +$('rtol').value, N: +$('N').value,
  };
}

function cPreset(name) {
  const [L1, L2, L3] = S.lps;
  return { l1closed: L1.C + 0.01, l1open: (L1.C + L2.C) / 2, l2open: (L2.C + L3.C) / 2, l3open: L3.C - 0.01 }[name];
}

function setC(C, live = true) {
  $('C').value = C; $('Cnum').value = (+C).toFixed(6);
  phys.setC(+C); if (live) R.request();
}

function onSystem(keepC) {
  const p = params();
  S.lps = lagrangePoints(p.mu);
  const [L1, L2, L3] = S.lps;
  $('muInfo').textContent = `μ = ${p.mu}\nρ = ${p.rho.toExponential(4)}  R_body = ${p.Rbody.toExponential(3)}`;
  $('Cticks').textContent = `C_L1 = ${L1.C.toFixed(5)}  C_L2 = ${L2.C.toFixed(5)}\nC_L3 = ${L3.C.toFixed(5)}  C_L4,5 = ${S.lps[3].C.toFixed(5)}`;
  $('C').min = L3.C - 0.05; $('C').max = L1.C + 0.05;
  if (!keepC) setC(cPreset('l1open'), false);
  phys.setSystem(params(), S.lps); phys.fitSecondary(); R.request();
}

function writeHash(p) {
  const q = new URLSearchParams({ system: p.system, C: p.C, rhoFactor: $('rhoFactor').value, kFar: $('kFar').value,
    N: p.N, T: p.T, rtol: p.rtol, layer: $('scalar').value });
  history.replaceState(null, '', '#' + q);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  for (const id of ['system', 'rhoFactor', 'kFar', 'N', 'T', 'rtol']) if (q.has(id)) $(id).value = q.get(id);
  if (q.has('layer')) $('scalar').value = q.get('layer');
  return q.has('C') ? +q.get('C') : null;
}

let refreshTimer = null;
const scheduleRefresh = () => { if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 150); };

function refresh() {
  const g = S.grid; if (!g) return;
  const { rgba, range } = colorize(g, $('scalar').value);
  man.setImage(rgba, g.N);
  $('legend').textContent = range ? `range: [${range[0].toPrecision(3)}, ${range[1].toPrecision(3)}]` : '';
  man.setOverlays(g, { quiver: $('showQuiver').checked, stream: $('showStream').checked, glyph: $('showGlyph').checked });
  phys.setRing(ringColors(g, $('ringReduce').value), g.N, $('showRing').checked);
  R.request();
}

async function compute() {
  const p = params(); writeHash(p);
  phys.setSystem(p, S.lps); phys.setTrajectory(null); man.setCross(null);
  const key = JSON.stringify({ ...p, v: CORE_VERSION });
  if (cache.has(key)) { S.grid = cache.get(key); refresh(); $('progress').textContent = 'cached'; return; }
  const passes = p.N > 64 ? [64, p.N] : [p.N];
  const t0 = performance.now();
  for (const N of passes) {
    const g = createGrid({ ...p, N }); S.grid = g;
    const rows = Math.max(1, Math.floor(2048 / N)), jobs = [];
    for (let j0 = 0; j0 < N; j0 += rows) jobs.push({ tileId: jobs.length, p: { ...p, N }, j0, j1: Math.min(N, j0 + rows) });
    jobs.sort((a, b) => Math.abs(a.j0 - N / 2) - Math.abs(b.j0 - N / 2));
    let done = 0;
    const ok = await pool.submit(jobs, (d) => {
      g.label.set(d.label, d.j0 * N); g.data.set(d.data, d.j0 * N * NF);
      done += d.j1 - d.j0;
      $('progress').textContent = `pass ${N}²: ${((100 * done) / N).toFixed(0)}%`;
      scheduleRefresh();
    });
    if (!ok) { $('progress').textContent = 'cancelled'; return; }
    postprocess(g); refresh();
  }
  cache.set(key, S.grid);
  const g = S.grid, counts = {};
  for (const l of g.label) counts[l] = (counts[l] || 0) + 1;
  const name = Object.fromEntries(Object.entries(LABEL).map(([k, v]) => [v, k.toLowerCase()]));
  $('progress').textContent = `done in ${((performance.now() - t0) / 1000).toFixed(1)} s\n` +
    Object.entries(counts).map(([l, c]) => `${name[l]}: ${c}`).join('  ');
}

function pick(alpha, beta) {
  const g = S.grid; if (!g) return;
  const [i, j] = nearestIndex(alpha, beta, g.N), [a, b] = xiAt(i, j, g.N), p = g.meta, k = j * g.N + i;
  const r = propagate(a, b, p, { withSTM: false, record: true });
  man.setCross(a, b);
  if (r.sIn) {
    const vIn = { at: r.sIn, v: inertialVel(r.sIn) };
    const vOut = r.exitY ? { at: [r.exitY[0], r.exitY[1]], v: inertialVel(r.exitY) } : null;
    phys.setTrajectory({ pts: r.traj }, vIn, vOut);
  } else phys.setTrajectory(null);
  const lines = [`α = ${((a * 180) / Math.PI).toFixed(2)}°  β = ${((b * 180) / Math.PI).toFixed(2)}°`,
    `label = ${Object.keys(LABEL).find((n) => LABEL[n] === g.label[k])}`];
  for (let f = 0; f < NF; f++) {
    const v = g.data[k * NF + f];
    if (Number.isFinite(v)) lines.push(`${FIELD_NAMES[f].padEnd(12)} ${v.toPrecision(6)}`);
  }
  if (g.post) for (const n of ['H00', 'H01', 'H11', 'detH', 'sig', 'asym']) {
    const v = g.post[n][k]; if (Number.isFinite(v)) lines.push(`${n.padEnd(12)} ${v.toPrecision(6)}`);
  }
  const pc = patchedConicPredict(a, b, p);
  if (pc) lines.push('— patched conic —', `δ_pc         ${pc.delta.toPrecision(6)}`, `ΔE_pc        ${pc.dE.toPrecision(6)}`, `b            ${pc.b.toPrecision(6)}`);
  $('inspector').textContent = lines.join('\n');
  R.request();
}

// ---- events
$('system').onchange = () => onSystem(false);
$('C').oninput = () => setC($('C').value);
$('C').onchange = () => compute();
$('Cnum').onchange = () => { setC($('Cnum').value); compute(); };
document.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { setC(cPreset(b.dataset.preset)); compute(); }));
$('run').onclick = compute;
$('cancel').onclick = () => pool.cancel();
$('scalar').onchange = () => { refresh(); if (S.grid) writeHash(S.grid.meta); };
for (const id of ['showQuiver', 'showStream', 'showGlyph', 'showRing', 'ringReduce']) $(id).onchange = refresh;
$('showPot').onchange = () => { phys.uniforms.showPot.value = +$('showPot').checked; R.request(); };
$('showZvc').onchange = () => { phys.uniforms.showZvc.value = +$('showZvc').checked; R.request(); };
$('fitSys').onclick = () => { phys.fitSystem(); R.request(); };
$('fitSec').onclick = () => { phys.fitSecondary(); R.request(); };
$('png').onclick = () => {
  R.draw();
  const a = document.createElement('a'); a.href = $('view').toDataURL('image/png'); a.download = 'slingshot-field.png'; a.click();
};
$('bin').onclick = () => {
  const g = S.grid; if (!g) return;
  const header = new TextEncoder().encode(JSON.stringify({ meta: g.meta, fields: FIELD_NAMES, version: CORE_VERSION }) + '\n');
  const blob = new Blob([header, g.label, g.data.buffer]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'encounter-grid.bin'; a.click();
};

const canvas = $('view');
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: false, hit: R.hit(e) };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  if (drag.moved) { drag.hit.view.pan(dx / drag.hit.w, dy / drag.hit.h); drag.x = e.clientX; drag.y = e.clientY; R.request(); }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved && drag.hit.i === 1) {
    const h = R.hit(e), [a, b] = man.toWorld(h.u, h.v);
    if (a >= 0 && a < 2 * Math.PI && Math.abs(b) < Math.PI / 2) pick(a, b);
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); const h = R.hit(e);
  h.view.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, h.u, h.v); R.request();
}, { passive: false });

// ---- boot
$('N').value = String(DEFAULTS.N);
const hashC = readHash();
onSystem(false);
if (hashC != null) setC(hashC, false);
compute();