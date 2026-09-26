import { createRenderer } from './render/renderer.js';
import { ClusterView } from './render/clusterMesh.js';
import { ParticleView } from './render/particles.js';
import { Overlays } from './render/overlays.js';

const $ = (id) => document.getElementById(id);
const { renderer, scene, camera, controls } = createRenderer($('view'));
const views = new Map();
const particles = new ParticleView(scene);
const overlays = new Overlays(scene);
let colorMode = 'material', lastSnap = null, gmul = 1;

const worker = new Worker(new URL('./sim/worker.js', import.meta.url), { type: 'module' });
worker.onerror = (e) => {
   const msg = e.message || 'worker failed to load (missing vendor/simplex-noise? run node scripts/vendor.mjs)';
   console.error(msg); $('survey').textContent = 'Simulation error: ' + msg;
};
worker.onmessage = (e) => {
  const m = e.data;
   if (m.type === 'error') { $('survey').textContent = 'Simulation error: ' + m.message; log({ tick: '-', type: 'error', message: m.message }); }
   else if (m.type === 'survey') { gmul = m.gmul; showSurvey(m.survey); }
  else if (m.type === 'snap') applySnap(m);
};

function generate() {
  for (const v of views.values()) v.dispose(scene);
  views.clear();
  worker.postMessage({ type: 'init', seed: $('seed').value, cls: $('cls').value, radius: +$('radius').value, gmul: +$('gmul').value });
}
$('gen').onclick = generate;
document.querySelectorAll('[data-cmd]').forEach((b) => (b.onclick = () => worker.postMessage({ type: 'cmd', cmd: b.dataset.cmd })));

function applySnap(s) {
  lastSnap = s;
  const sel = s.clusters.find((c) => s.hud && c.id === s.hud.id);
  const origin = sel ? sel.X : [0, 0, 0];
  const alive = new Set();
  for (const c of s.clusters) {
    alive.add(c.id);
    let v = views.get(c.id);
    if (!v) { v = new ClusterView(scene); views.set(c.id, v); }
    let recolor = false;
    if (c.voxels) { v.setVoxels(c.voxels); recolor = true; }
    if (c.stress) { v.stress = c.stress; if (colorMode === 'stress') recolor = true; }
    if (recolor) v.recolor(colorMode);
    v.setTransform(c.X, c.q, origin);
  }
  for (const [id, v] of views) if (!alive.has(id)) { v.dispose(scene); views.delete(id); }
  particles.update(s.particles, origin);
  overlays.update(s, sel, origin);
  const d = Math.floor(s.time / 86400), hms = new Date((s.time % 86400) * 1000).toISOString().slice(11, 19);
  $('time').textContent = `T+${d}d ${hms}  ×${s.warp}${s.paused ? ' PAUSED' : ''}`;
  if (s.hud) showHud(s.hud);
  for (const ev of s.events) log(ev);
}

const fmt = (x, d = 3) => (Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-2 && x !== 0) ? x.toExponential(d - 1) : x.toFixed(d));
function showHud(h) {
  $('insp').textContent =
    `cluster #${h.id}\nmass ${fmt(h.M)} kg\nvoxels ${h.n}\nradius ${fmt(h.rad)} m\n` +
    `spin period ${(h.period / 3600).toFixed(2)} h\nω ${h.w.map((x) => fmt(x)).join(', ')}\n` +
    `v_esc ${fmt(h.vesc * 100)} cm/s\nclusters ${h.clusters}  particles ${h.particles}\n` +
    `gravity grid ${h.grid ? 'yes' : 'no'}${h.gridBuilding ? ' (building)' : ''}\n|L| ${fmt(Math.hypot(...h.L))}\n` +
    `Δv booked ${fmt(Math.hypot(...h.dv))} m/s${gmul !== 1 ? '\n⚠ unphysical G×' + gmul : ''}`;
}
function showSurvey(s) {
  $('survey').textContent =
    `class ${s.cls}  seed ${s.seed}\nmass ${fmt(s.mass)} kg (${s.voxels} voxels)\n` +
    `dims ${s.dims.map((x) => x.toFixed(0)).join('×')} m\nspin ${(s.period / 3600).toFixed(2)} h\n` +
    `breakup ${(s.breakup / 3600).toFixed(2)} h\nescape ${fmt(s.escape * 100)} cm/s\n` +
    Object.entries(s.materials).map(([k, v]) => `${k}: ${v}`).join('  ');
}
function log(ev) {
  const div = document.createElement('div');
  const { tick, type, ...rest } = ev;
  div.textContent = `[${tick}] ${type} ${JSON.stringify(rest)}`;
  $('log').prepend(div);
  while ($('log').childElementCount > 200) $('log').lastChild.remove();
}

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '1' || e.key === '2') {
    colorMode = e.key === '1' ? 'material' : 'stress';
    for (const v of views.values()) v.recolor(colorMode);
  } else if (e.key === '4') overlays.show.vel = !overlays.show.vel;
  else if (e.key === '6') overlays.show.axes = !overlays.show.axes;
  else if (e.key === ' ') { worker.postMessage({ type: 'pause' }); e.preventDefault(); }
  else if (e.key === ',') worker.postMessage({ type: 'warp', dir: -1 });
  else if (e.key === '.') worker.postMessage({ type: 'warp', dir: 1 });
  else if (e.key === 'f' || e.key === 'F') controls.target.set(0, 0, 0);
});

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  renderer.render(scene, camera);
}
frame();
generate();