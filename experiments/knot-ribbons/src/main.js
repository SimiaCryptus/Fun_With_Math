import { Store, DEFAULT, sanitize } from './state.js';
import { encodeState, decodeState } from './export/url.js';
import { createAlgebra } from './algebra/client.js';
import { cascade } from './algebra/wreath.js';
import { strandPaths } from './geometry/layout.js';
import { closeComponents, measureFraming } from './geometry/closure.js';
import { createScene } from './render/scene.js';
import { PALETTE } from './render/materials.js';
import { renderDiagram } from './render/views.js';
import { bindPanel } from './ui/panel.js';
import { renderReadout } from './ui/readout.js';
import { sageScript, snappyScript } from './export/sage.js';
import { braidToPD } from './export/pd.js';
import { toOBJ, toSTL } from './export/mesh.js';

const $ = (id) => document.getElementById(id);
const store = new Store(sanitize(decodeState(location.hash)) ?? DEFAULT);
const algebra = createAlgebra();
const ui = { advanced: false, xray: false, explode: store.state.sliced ? 1 : 0, selected: null };
let current = null;
let req = 0;

let scene = null;
try {
  scene = await createScene($('viewport'));
} catch (e) {
  $('viewport').innerHTML = `<p class="error" style="padding:16px">3D view unavailable: ${e.message}</p>`;
}

const download = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const tween = (ms, f) => new Promise((res) => {
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    f(t);
    if (t < 1) requestAnimationFrame(step); else res();
  };
  requestAnimationFrame(step);
});

const panel = bindPanel(store, {
  async onSlice() {
    if (store.state.sliced) { store.set({ sliced: false }); return; }
    scene?.setExplode(0);
    await tween(1400, (t) => scene?.setKnife(t));
    ui.explode = 1;
    panel.setExplode(1);
    await tween(600, (t) => scene?.setExplode(t));
    store.set({ sliced: true });
  },
  onExplode(v) { ui.explode = v; scene?.setExplode(v); },
  onXray(b) { ui.xray = b; scene?.setXray(b); },
  onAdvanced(b) {
    ui.advanced = b;
    document.body.classList.toggle('advanced', b);
    if (current) { drawReadout(); if (b) scheduleFraming(req); }
  },
  onShare() {
    navigator.clipboard?.writeText(location.href);
    panel.setError('Link copied to clipboard.');
  },
  onExport(kind) {
    if (!current) return;
    const { a } = current;
    if (kind === 'sage') download('ribbon.sage', sageScript(a.n, a.totalWord));
    if (kind === 'snappy') download('ribbon_snappy.py', snappyScript(a.totalWord));
    if (kind === 'pd') download('ribbon_pd.txt', braidToPD(a.totalWord, a.n).text);
    if (kind === 'obj' && scene) download('ribbon.obj', toOBJ(scene.meshData()));
    if (kind === 'stl' && scene) download('ribbon.stl', toSTL(scene.meshData()));
  },
});

function drawReadout() {
  const { a, framings } = current;
  let casc = null;
  try {
    casc = a.cuts.length ? cascade(a.n, a.m, a.cycles, a.cuts, framings) : null;
  } catch (e) {
    panel.setError(e.message);
  }
  renderReadout($('readout'), a, {
    colors: PALETTE, framings, cascade: casc, advanced: ui.advanced, backend: scene?.backend ?? 'none',
  });
}

function drawDiagram() {
  const { a, layout } = current;
  renderDiagram($('diagram'), a.intWord, a.n, a.compOf, PALETTE, (j) => {
    scene?.setMarker(j === null ? null : layout.crossings[j]);
  });
}

function scheduleFraming(id) {
  setTimeout(() => {
    if (id !== req || !current) return;
    current.framings = current.comps.map((c) => measureFraming(c, current.layout.hwStrand * 0.5));
    drawReadout();
  }, 30);
}

async function refresh() {
  const st = store.state;
  const id = ++req;
  panel.sync(st);
  const a = await algebra.analyze(st);
  if (id !== req) return;
  panel.setError(a.error || '');
  if (a.error) return;
  const layout = strandPaths(a.intWord, a.n, a.m);
  const comps = closeComponents(layout, a.tau, a.cycles);
  current = { a, layout, comps, framings: null };
  ui.selected = null;
  scene?.setModel({ layout, compOf: a.compOf, k: a.k, colors: PALETTE });
  scene?.setXray(ui.xray);
  scene?.setKnife(st.sliced ? 1 : 0);
  scene?.setExplode(st.sliced ? ui.explode : 0);
  drawDiagram();
  drawReadout();
  history.replaceState(null, '', '#s=' + encodeState(st));
  if (ui.advanced) scheduleFraming(id);
}

if (scene) {
  let down = null;
  scene.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  scene.canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const hit = scene.pick(e);
    ui.selected = hit && hit.comp !== ui.selected ? hit.comp : null;
    scene.highlight(ui.selected);
  });
}

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  e.preventDefault();
  if (e.shiftKey) store.redo(); else store.undo();
});

store.subscribe(refresh);
refresh();