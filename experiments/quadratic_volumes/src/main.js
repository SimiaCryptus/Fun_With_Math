import { createScene } from './viz/scene.js';
import { createPointsLayer } from './viz/pointsLayer.js';
import { createBoxLayer } from './viz/boxLayer.js';
import { createSurfaceLayer } from './viz/surfaceLayer.js';
import { createSampleLayer } from './viz/sampleLayer.js';
import { createLedgerView } from './viz/ledgerView.js';
import { createRaceView } from './viz/raceView.js';
import { createProfileView } from './viz/profileView.js';
import { DATASETS, getDataset } from '../datasets/index.js';
import { PRESETS } from '../datasets/presets.js';
import { makeRng } from './core/rng.js';
import { readHash, writeHash, DEFAULTS } from './config.js';
import { MSG } from './workers/protocol.js';

const cfg = readHash(DEFAULTS);
const { scene } = createScene(document.getElementById('view'));
const pts = createPointsLayer(scene);
const boxes = createBoxLayer(scene);
const surfaces = createSurfaceLayer(scene);
const samples = createSampleLayer(scene);

const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent = m + '\n' + $('log').textContent; };
const ledger = createLedgerView($('ledgerBar'));
const raceView = createRaceView($('raceCanvas'));
const profileView = createProfileView($('profileCanvas'));

const ALL_FAMILIES = [
  'tightBox', 'axis', 'affinePCA', 'quadEllipsoid', 'quadImplicit',
];
const FAMILY_HELP = {
   tightBox: 'Mandatory defensive baseline: contract the region to the tight ' +
     'bounding box of its points. A curved split must beat this cheap ' +
     'margin-trimming move before it is credited with finding structure.',
   axis: 'Coordinate fields x, y, z. With the KT branch code this reproduces ' +
     'a density-estimation-tree baseline.',
   affinePCA: 'Principal directions of the node points. The smallest-variance ' +
     'direction, as a slab, is the "plane law" candidate.',
   quadEllipsoid: 'Mahalanobis distance from the node mean: sublevel sets are ' +
     'ellipsoids, two-sided slabs are shells.',
   quadImplicit: 'Algebraic quadric g(x) ≈ 0 fitted to the lifted scatter. ' +
     'Slabs |g| < w are the implicit-relation (law) candidates.',
};

const sel = $('dataset');
for (const id of Object.keys(DATASETS)) {
  const o = document.createElement('option');
  o.value = id; o.textContent = DATASETS[id].name;
  sel.appendChild(o);
}
const presetSel = $('preset');
presetSel.appendChild(new Option('—', ''));
for (const k of Object.keys(PRESETS)) presetSel.appendChild(new Option(k, k));

sel.value = cfg.dataset;
$('seed').value = cfg.seed;
$('N').value = cfg.N;
$('maxDepth').value = cfg.maxDepth;
$('epsK').value = cfg.epsK;
$('protocol').value = cfg.protocol;
$('raceBudget').value = cfg.raceBudget;
$('raceStep').value = cfg.raceStep;
$('complexityMultiplier').value = cfg.complexityMultiplier;
$('baselines').checked = cfg.baselines !== false;
$('curve').checked = !!cfg.curve;
$('slabs').checked = cfg.slabs !== false;
$('showBoxes').checked = cfg.showBoxes !== false;
$('showSurfaces').checked = cfg.showSurfaces !== false;
$('showPoints').checked = cfg.showPoints !== false;
$('showSamples').checked = cfg.showSamples !== false;
$('sampleCount').value = cfg.sampleCount;

const famHost = $('families');
for (const f of ALL_FAMILIES) {
  const lab = document.createElement('label');
  lab.className = 'inline';
   lab.title = FAMILY_HELP[f] || f;
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
   $('datasetDesc').textContent = ds.description || '';
  const host = $('params');
  host.innerHTML = '';
  for (const [k, p] of Object.entries(ds.params)) {
    const lab = document.createElement('label');
    lab.textContent = k;
     lab.title = `${k}: ${p.min !== undefined ? `range ${p.min}…${p.max}, ` : ''}default ${p.value}`;
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
  cfg.protocol = $('protocol').value;
  cfg.raceBudget = +$('raceBudget').value;
  cfg.raceStep = +$('raceStep').value;
  cfg.complexityMultiplier = +$('complexityMultiplier').value;
  cfg.baselines = $('baselines').checked;
  cfg.curve = $('curve').checked;
  cfg.slabs = $('slabs').checked;
  cfg.showBoxes = $('showBoxes').checked;
  cfg.showSurfaces = $('showSurfaces').checked;
   cfg.showPoints = $('showPoints').checked;
   cfg.showSamples = $('showSamples').checked;
   cfg.sampleCount = +$('sampleCount').value;
  cfg.families = [...famHost.querySelectorAll('input')]
    .filter((c) => c.checked).map((c) => c.dataset.fam);
  cfg.params = {};
  for (const inp of $('params').querySelectorAll('input')) {
    const v = inp.value;
    cfg.params[inp.dataset.key] = isNaN(+v) || v === '' ? v : +v;
  }
  writeHash(cfg);
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  cfg.dataset = p.dataset;
  cfg.N = p.N;
  cfg.seed = p.seed;
  cfg.params = { ...p.params };
  sel.value = cfg.dataset;
  $('N').value = cfg.N;
  $('seed').value = cfg.seed;
  renderParams();
  generate();
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

function fmtRecovery(r) {
  if (!r) return 'no declared truth for this dataset';
  if (!r.matched) return `truth type "${r.type}": no matching constraint accepted`;
  const b = r.best;
  if (r.type === 'plane') {
    return `plane recovered (${b.family}, depth ${b.depth})\n` +
           `  angle error : ${b.angleDeg.toFixed(2)}°\n` +
           `  slab width  : ${b.width == null ? 'n/a (one-sided)' : b.width.toFixed(4)}`;
  }
  return `sphere recovered (${b.family}, depth ${b.depth})\n` +
         `  centre error : ${b.centerError.toFixed(4)}\n` +
         `  radius       : ${b.radius.toFixed(4)} (truth ${r.truth.radius}, ` +
         `err ${b.radiusError.toFixed(4)})`;
}

worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === MSG.PROGRESS) { log(m.text); return; }
  if (m.type === MSG.RACE) { raceView.draw(m.bars, m.note); return; }
  if (m.type === MSG.ERROR) { log('ERROR ' + m.text); return; }
  if (m.type !== MSG.DONE) return;

  pts.set(m.points, m.leafIds);
   pts.setVisible && pts.setVisible(cfg.showPoints);
  boxes.set(m.boxes, m.boxLeafIds);
  boxes.setVisible(cfg.showBoxes);
  surfaces.set(m.splits);
  surfaces.setVisible(cfg.showSurfaces);
   samples.set(m.sampled);
   samples.setVisible(cfg.showSamples);

  const ev = m.evaluation;
  let txt =
    `no model      : ${m.baseline.toFixed(2)} bits/pt\n` +
    `test  (mid V) : ${ev.bitsPerPoint.toFixed(3)} bits/pt\n` +
    `test  (V+)    : ${m.evaluationUpper.bitsPerPoint.toFixed(3)} bits/pt\n` +
    `train         : ${m.evaluationTrain.bitsPerPoint.toFixed(3)} bits/pt\n` +
    `model bits    : ${m.stats.modelBits.toFixed(1)} ` +
    `(${ev.modelBitsPerTrainPoint.toFixed(4)}/pt)\n` +
    `splits/leaves : ${m.stats.splits} / ${m.stats.leaves}\n` +
    `race boxes    : ${m.stats.raceBoxes} over ${m.stats.raceNodes} nodes\n` +
    `codimension   : ${m.codim}\n` +
    `time          : ${m.stats.ms.toFixed(0)} ms\n`;
  if (m.baselines) {
    txt += '\nbaselines (test bits/pt, +model/pt)\n';
    for (const b of m.baselines) {
      txt += `  ${b.name.padEnd(24)} ${b.bitsPerPoint.toFixed(3)}` +
             ` +${b.modelBitsPerTrainPoint.toFixed(4)}\n`;
    }
  }
  if (m.curve) {
    txt += '\nbits vs model bits\n';
    for (const c of m.curve) {
      txt += `  λ=${String(c.lambda).padEnd(5)} model=${c.modelBits.toFixed(0)}` +
             ` splits=${c.splits} test=${c.testBits.toFixed(3)}\n`;
    }
  }
  $('ledger').textContent = txt;
  ledger.draw({
    baseline: m.baseline,
    total: ev.bitsPerPoint,
    modelPerPoint: ev.modelBitsPerTrainPoint,
  });
  profileView.draw(m.profile);
  $('recovery').textContent = fmtRecovery(m.recovery);
  $('tree').textContent = m.text;
  log(`trained: ${m.stats.splits} splits in ${m.stats.ms.toFixed(0)} ms`);
};

function train() {
  collect();
  log('training…');
  worker.postMessage({ cmd: MSG.TRAIN, ...cfg });
}

sel.addEventListener('change', renderParams);
presetSel.addEventListener('change', () => applyPreset(presetSel.value));
$('generate').addEventListener('click', generate);
$('train').addEventListener('click', train);
$('showBoxes').addEventListener('change', () => {
  cfg.showBoxes = $('showBoxes').checked; boxes.setVisible(cfg.showBoxes);
});
$('showSurfaces').addEventListener('change', () => {
  cfg.showSurfaces = $('showSurfaces').checked;
  surfaces.setVisible(cfg.showSurfaces);
});
$('showPoints').addEventListener('change', () => {
   cfg.showPoints = $('showPoints').checked;
   pts.setVisible(cfg.showPoints);
});
$('showSamples').addEventListener('change', () => {
   cfg.showSamples = $('showSamples').checked;
   samples.setVisible(cfg.showSamples);
});
// collapsible floating panels
for (const p of document.querySelectorAll('.panel')) {
   p.querySelector('header').addEventListener('click', () =>
     p.classList.toggle('collapsed'));
}

renderParams();
generate();