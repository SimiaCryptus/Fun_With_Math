import { createScene } from './viz/scene.js';
import { createPointsLayer } from './viz/pointsLayer.js';
import { createBoxLayer } from './viz/boxLayer.js';
import { createSurfaceLayer } from './viz/surfaceLayer.js';
import { createLedgerView } from './viz/ledgerView.js';
import { DATASETS, getDataset } from '../datasets/index.js';
import { makeRng } from './core/rng.js';
import { readHash, writeHash, DEFAULTS } from './config.js';
import { MSG } from './workers/protocol.js';

const cfg = readHash(DEFAULTS);
const { scene } = createScene(document.getElementById('view'));
const pts = createPointsLayer(scene);
const boxes = createBoxLayer(scene);
const surfaces = createSurfaceLayer(scene);

const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent = m + '\n' + $('log').textContent; };
const ledger = createLedgerView($('ledgerBar'));

const ALL_FAMILIES = [
  'tightBox', 'axis', 'affinePCA', 'quadEllipsoid', 'quadImplicit',
];

const sel = $('dataset');
for (const id of Object.keys(DATASETS)) {
  const o = document.createElement('option');
  o.value = id; o.textContent = DATASETS[id].name;
  sel.appendChild(o);
}
sel.value = cfg.dataset;
$('seed').value = cfg.seed;
$('N').value = cfg.N;
$('maxDepth').value = cfg.maxDepth;
$('epsK').value = cfg.epsK;
$('slabs').checked = cfg.slabs !== false;
$('showBoxes').checked = cfg.showBoxes !== false;
$('showSurfaces').checked = cfg.showSurfaces !== false;

// family checkboxes
const famHost = $('families');
for (const f of ALL_FAMILIES) {
  const lab = document.createElement('label');
  lab.className = 'inline';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.fam = f;
  cb.checked = cfg.families.includes(f);
  lab.appendChild(cb);
  lab.appendChild(document.createTextNode(' ' + f));
  famHost.appendChild(lab);
}

function renderParams() {
  const ds = getDataset(sel.value);
  const host = $('params');
  host.innerHTML = '';
  for (const [k, p] of Object.entries(ds.params)) {
    const lab = document.createElement('label');
    lab.textContent = k;
    const inp = document.createElement('input');
    inp.value = cfg.params[k] ?? p.value;
    inp.dataset.key = k;
    lab.appendChild(inp);
    host.appendChild(lab);
  }
}

function collect() {
  cfg.dataset = sel.value;
  cfg.seed = +$('seed').value;
  cfg.N = +$('N').value;
  cfg.maxDepth = +$('maxDepth').value;
  cfg.epsK = +$('epsK').value;
  cfg.slabs = $('slabs').checked;
  cfg.showBoxes = $('showBoxes').checked;
  cfg.showSurfaces = $('showSurfaces').checked;
  cfg.families = [...famHost.querySelectorAll('input')]
    .filter((c) => c.checked).map((c) => c.dataset.fam);
  cfg.params = {};
  for (const inp of $('params').querySelectorAll('input')) {
    const v = inp.value;
    cfg.params[inp.dataset.key] = isNaN(+v) || v === '' ? v : +v;
  }
  writeHash(cfg);
}

let xs = null;
function generate() {
  collect();
  const ds = getDataset(cfg.dataset);
  xs = ds.generate(cfg.params, makeRng(cfg.seed), cfg.N);
  pts.set(xs);
  boxes.clear();
  surfaces.clear();
  log(`generated ${cfg.N} points from ${ds.name}`);
}

const worker = new Worker(
  new URL('./workers/train.worker.js', import.meta.url), { type: 'module' }
);

worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === MSG.PROGRESS) { log(m.text); return; }
  if (m.type === MSG.ERROR) { log('ERROR ' + m.text); return; }
  if (m.type !== MSG.DONE) return;

  pts.set(m.points, m.leafIds);
  boxes.set(m.boxes, m.boxLeafIds);
  boxes.setVisible(cfg.showBoxes);
  surfaces.set(m.splits);
  surfaces.setVisible(cfg.showSurfaces);

  const ev = m.evaluation;
  $('ledger').textContent =
    `no model      : ${m.baseline.toFixed(2)} bits/pt\n` +
    `train code    : ${ev.bitsPerPoint.toFixed(3)} bits/pt\n` +
    `model bits    : ${m.stats.modelBits.toFixed(1)} ` +
    `(${ev.modelBitsPerTrainPoint.toFixed(4)}/pt)\n` +
    `splits/leaves : ${m.stats.splits} / ${m.stats.leaves}\n` +
    `IN boxes      : ${m.boxes.length / 6}\n` +
    `time          : ${m.stats.ms.toFixed(0)} ms`;
  ledger.draw({
    baseline: m.baseline,
    total: ev.bitsPerPoint,
    modelPerPoint: ev.modelBitsPerTrainPoint,
  });
  $('tree').textContent = m.text;
  log(`trained: ${m.stats.splits} splits in ${m.stats.ms.toFixed(0)} ms`);
};

function train() {
  collect();
  log('training…');
  worker.postMessage({ cmd: MSG.TRAIN, ...cfg });
}

sel.addEventListener('change', renderParams);
$('generate').addEventListener('click', generate);
$('train').addEventListener('click', train);
$('showBoxes').addEventListener('change', () => {
  cfg.showBoxes = $('showBoxes').checked; boxes.setVisible(cfg.showBoxes);
});
$('showSurfaces').addEventListener('change', () => {
  cfg.showSurfaces = $('showSurfaces').checked;
  surfaces.setVisible(cfg.showSurfaces);
});
renderParams();
generate();