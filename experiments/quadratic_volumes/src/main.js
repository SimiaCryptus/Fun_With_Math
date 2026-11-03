import { createScene } from './viz/scene.js';
import { createPointsLayer } from './viz/pointsLayer.js';
import { DATASETS, getDataset } from '../datasets/index.js';
import { makeRng } from './core/rng.js';
import { readHash, writeHash, DEFAULTS, epsToVEps } from './config.js';
import { trainTree } from './tree/train.js';
import { evaluate, descend } from './tree/evaluate.js';
import { countNodes, treeText, walkLeaves } from './tree/node.js';

const cfg = readHash(DEFAULTS);
const { scene } = createScene(document.getElementById('view'));
const pts = createPointsLayer(scene);

const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent = m + '\n' + $('log').textContent; };

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
  const rng = makeRng(cfg.seed);
  xs = ds.generate(cfg.params, rng, cfg.N);
  pts.set(xs);
  log(`generated ${cfg.N} points from ${ds.name}`);
}

function train() {
  if (!xs) generate();
  const vEps = epsToVEps(cfg.epsK, 3);
  const t0 = performance.now();
  const { tree, stats } = trainTree(xs, {
    maxDepth: cfg.maxDepth, vEps, families: ['tightBox', 'axis'],
  });
  const dt = performance.now() - t0;
  const N = xs.length / 3;
  const idx = [...Array(N).keys()];
  const ev = evaluate(tree, xs, idx, {
    vEps, modelBits: stats.modelBits, nTrain: N,
  });
  const c = countNodes(tree);
  $('ledger').textContent =
    `no model      : ${(3 * cfg.epsK).toFixed(2)} bits/pt\n` +
    `train code    : ${ev.bitsPerPoint.toFixed(3)} bits/pt\n` +
    `model bits    : ${stats.modelBits.toFixed(1)} (${ev.modelBitsPerTrainPoint.toFixed(4)}/pt)\n` +
    `splits/leaves : ${c.splits} / ${c.leaves}\n` +
    `time          : ${dt.toFixed(0)} ms`;
  $('tree').textContent = treeText(tree);

  // colour points by leaf
  const leaves = [...walkLeaves(tree)];
  const ids = new Map(leaves.map((L, i) => [L, i]));
  const leafIds = new Int32Array(N);
  const x = new Float64Array(3);
  for (let i = 0; i < N; i++) {
    x[0] = xs[i * 3]; x[1] = xs[i * 3 + 1]; x[2] = xs[i * 3 + 2];
    leafIds[i] = ids.get(descend(tree, x));
  }
  pts.set(xs, leafIds);
  log(`trained: ${c.splits} splits in ${dt.toFixed(0)} ms`);
}

sel.addEventListener('change', renderParams);
$('generate').addEventListener('click', generate);
$('train').addEventListener('click', train);
renderParams();
generate();