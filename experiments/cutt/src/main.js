// App bootstrap: UI <-> controller <-> viz. Visualization only reads run state.
import * as THREE from 'three';
import { createScene } from './viz/scene.js';
import { renderScene, pickObs } from './viz/layers.js';
import { Run, DEFAULT_PARAMS, paramsForScenario, widthSweep } from './controller.js';
import { SCENARIOS } from './data/scenarios.js';
import { renderInspector } from './ui/inspector.js';
import { plotXY, drawMinimap } from './ui/charts.js';
import { leafOfPoint } from './core/tree.js';
import { STATUS } from './core/status.js';
import { CLASS_COLORS, STATUS_COLORS } from './viz/palette.js';

const $ = id => document.getElementById(id);
const VIEWS = ['data', 'partition', 'contraction', 'mass', 'theory', 'envelope', 'status'];
// One-line explanations of each view, shown in the viewport caption and as tab tooltips.
const VIEW_HELP = {
   data: 'Raw uncertain observations. Each box is where the point could be, coloured by allowed labels. Dashed boxes have partial labels (several allowed classes).',
   partition: 'Master-tree leaves as floor tiles. Colour shows hard anchor counts or soft fitted φ (see the Tile colour selector). A cross marks a class that the leaf excludes.',
   contraction: 'SUPPORT SOLVE (hard). Grey boxes are raw supports and coloured boxes are contracted ones. Orange slabs were removed by anchor evidence. Scrub sweeps on the left.',
   mass: 'SOLVE (soft). Height is fitted mass density and outlines show the geometric prior. Click a box to see its fragments as columns relative to the prior lid.',
   theory: 'CHALLENGE. Tiles are recoloured by the selected theory\'s φ. Compare the minimaps: same predictions with different mass placement is the latent Rashomon set.',
   envelope: 'BOUNDS. Height is envelope width. For a selected box, solid columns show fitted mass, ghost columns the upper bound, and red rings the lower bound. Not certified.',
   status: 'Epistemic status per observation. Dotted outlines failed the evidence test, so nothing in the data speaks to them. Click a box to see per-fragment status.',
};
// Tooltips for every tunable control.
const HELP = {
   seed: 'Random seed. Same seed and parameters give an identical run.',
   N: 'Number of observations.',
   width: 'Interval width as a fraction of each feature\'s range. The main sweep axis.',
   asym: 'Make one coordinate much narrower than the others.',
   anchorFloor: 'Fraction of observations given exact values so the hard layer has anchors (§8.1).',
   partial: 'Probability of adding a distractor class to the allowed label set.',
   noise: 'Probability of replacing the true label. Tests robustness of exclusion (M4).',
   corr: 'Correlation between x and y. High values make x and y redundant explanations.',
   offDiag: 'Fraction of points placed in the disagreeing quadrants so they have statistics.',
   widen: 'Which feature receives the wide intervals.',
   spanFrac: 'Fraction of observations whose box spans both modes.',
   control: 'Make labels depend on x as well, so the modes become distinguishable.',
   herd: 'Initialise all spanning boxes on the same mode (collective self-reinforcement test).',
   dMax: 'Maximum depth of the learned tree.',
   crit: 'S1: expected Gini. S3: ambiguity reduction per added fragment.',
   fragBudget: 'Maximum total fragments, as a multiple of N.',
   rebuild: 'Relearn the tree from contracted supports only (P6).',
   beta: 'Temperature. 1 = Bayesian, higher = more conservative, ∞ = frozen at the prior.',
   mMin: 'Minimum anchors before a leaf may exclude a class.',
   alphaExcl: 'Family-wise error level for exclusion (divided by leaves × classes).',
   tauExcl: 'A class is excluded when its upper confidence bound falls below this value.',
   kProp: 'Maximum derivation depth of anchors allowed to vote (limits cascades).',
   epsBar: 'Per-observation free-energy tolerance defining "near-optimal".',
   eta: 'Damping of SOLVE updates.',
   restarts: 'Number of perturbed SOLVE restarts.',
   dirAlpha: 'Dirichlet pseudo-count in leaf class distributions.',
   loo: 'Leave-one-out: an observation never uses its own contribution (P3).',
   alternating: 'Update labels from locations and vice versa (within-point self-consumption).',
   leak: 'Delete fragments with low fitted mass, so weights become support (violates P1).',
};

const SCHEMA = [
  { k: 'seed', l: 'Seed', t: 'number', step: 1 },
  { k: 'N', l: 'N', t: 'number', step: 50 },
  { k: 'width', l: 'Corruption width', t: 'range', min: 0, max: 0.7, step: 0.01 },
  { k: 'asym', l: 'Asymmetric widths', t: 'check', only: ['S1', 'S6'] },
  { k: 'anchorFloor', l: 'Anchor floor', t: 'range', min: 0, max: 0.5, step: 0.01 },
  { k: 'partial', l: 'Partial-label rate', t: 'range', min: 0, max: 0.8, step: 0.05 },
  { k: 'noise', l: 'Label-noise rate', t: 'range', min: 0, max: 0.3, step: 0.01 },
  { k: 'corr', l: 'Correlation', t: 'range', min: 0, max: 1, step: 0.05, only: ['S2'] },
  { k: 'offDiag', l: 'Off-diagonal fraction', t: 'range', min: 0, max: 0.3, step: 0.01, only: ['S2'] },
  { k: 'widen', l: 'Widen', t: 'select', opts: ['both', 'x', 'y'], only: ['S2'] },
  { k: 'spanFrac', l: 'Spanning fraction', t: 'range', min: 0, max: 0.6, step: 0.05, only: ['S3', 'S4'] },
  { k: 'control', l: 'Control (x informative)', t: 'check', only: ['S3', 'S4'] },
  { k: 'herd', l: 'Herd init', t: 'check', only: ['S3', 'S4'] },
   { k: 'dMax', l: 'Max depth', t: 'range', min: 1, max: 8, step: 1, only: ['S5', 'S8'] },
   { k: 'crit', l: 'Split criterion', t: 'select', opts: ['S1', 'S3'], only: ['S5', 'S8'] },
   { k: 'fragBudget', l: 'Fragment budget (×N)', t: 'range', min: 1, max: 10, step: 0.5, only: ['S5', 'S8'] },
   { k: 'rebuild', l: 'Rebuild loop (P6)', t: 'check', only: ['S5', 'S8'] },
];
const ADV = [
  ['beta', 0.25, 16, 0.25], ['mMin', 1, 30, 1], ['alphaExcl', 0.001, 0.2, 0.001], ['tauExcl', 0.01, 0.6, 0.01],
  ['kProp', 0, 6, 1], ['epsBar', 0.001, 0.2, 0.001], ['eta', 0.05, 1, 0.05], ['restarts', 1, 32, 1], ['dirAlpha', 0.1, 4, 0.1],
];
const SAFE = [['loo', 'Leave-one-out (off = A3, broken)'], ['alternating', 'Alternating labels (A11, broken)'], ['leak', 'Weight → support leak (violates P1)']];

const st = { params: loadHash(), view: 'data', sel: -1, theory: 0, snap: -1, iter: -1, truth: false, colorBy: 'anchors', env: 'local', stack: false, hl: null, sweep: null };
let run = null, timer = null;
const sc = createScene($('viewport'));
const group = new THREE.Group();
sc.scene.add(group);

function loadHash() {
  try { if (location.hash.length > 1) return { ...DEFAULT_PARAMS, ...JSON.parse(decodeURIComponent(location.hash.slice(1))) }; } catch (e) { /* ignore */ }
  return paramsForScenario('S1');
}
const saveHash = () => history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(st.params)));

function buildControls() {
  const sel = $('scenario');
  sel.innerHTML = Object.values(SCENARIOS).map(s => `<option value="${s.id}">${s.id} ${s.name}</option>`).join('');
  sel.value = st.params.scenario;
  sel.onchange = () => { st.params = paramsForScenario(sel.value, st.params.seed); buildControls(); rebuild(); };
  const box = $('scnParams');
  box.innerHTML = '';
  for (const s of SCHEMA) {
    if (s.only && !s.only.includes(st.params.scenario)) continue;
    const lab = document.createElement('label');
    lab.textContent = s.l + ' ';
     lab.title = HELP[s.k] || '';
    let inp;
    if (s.t === 'select') { inp = document.createElement('select'); inp.innerHTML = s.opts.map(o => `<option>${o}</option>`).join(''); inp.value = st.params[s.k]; }
    else {
      inp = document.createElement('input');
      inp.type = s.t === 'check' ? 'checkbox' : s.t;
      Object.assign(inp, { min: s.min ?? '', max: s.max ?? '', step: s.step ?? '' });
      if (s.t === 'check') inp.checked = !!st.params[s.k]; else inp.value = st.params[s.k];
    }
    const val = document.createElement('span');
    if (s.t === 'range') val.textContent = st.params[s.k];
    inp.oninput = () => { if (s.t === 'range') val.textContent = inp.value; };
    inp.onchange = () => {
      st.params[s.k] = s.t === 'check' ? inp.checked : s.t === 'select' ? inp.value : Number(inp.value);
      rebuild();
    };
    lab.append(inp, val);
    box.append(lab);
  }
  const adv = $('advParams');
  adv.innerHTML = '';
  for (const [k, mn, mx, step] of ADV) {
    const lab = document.createElement('label');
    lab.textContent = k;
     lab.title = HELP[k] || '';
    const inp = Object.assign(document.createElement('input'), { type: 'number', min: mn, max: mx, step, placeholder: 'preset', value: st.params.overrides[k] ?? '' });
    inp.onchange = () => { if (inp.value === '') delete st.params.overrides[k]; else st.params.overrides[k] = Number(inp.value); rebuild(); };
    lab.append(inp);
    adv.append(lab);
  }
  const binf = document.createElement('label');
  binf.textContent = 'β = ∞ (prior limit)';
  const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: st.params.overrides.beta === 'inf' });
  cb.onchange = () => { if (cb.checked) st.params.overrides.beta = 'inf'; else delete st.params.overrides.beta; rebuild(); };
  binf.append(cb);
  adv.append(binf);
  $('preset').value = st.params.preset;
  const safe = $('safeParams');
  safe.innerHTML = '';
  for (const [k, l] of SAFE) {
    const lab = document.createElement('label');
    lab.textContent = l;
     lab.title = HELP[k] || '';
    const inp = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!st.params[k] });
    inp.onchange = () => { st.params[k] = inp.checked; rebuild(); };
    lab.append(inp);
    safe.append(lab);
  }
   $('views').innerHTML = VIEWS.map(v => `<button data-view="${v}" title="${VIEW_HELP[v]}" class="${v === st.view ? 'active' : ''}">${v}</button>`).join('');
}

$('preset').onchange = e => { st.params.preset = e.target.value; rebuild(); };
$('views').onclick = e => { const v = e.target.dataset.view; if (v) { st.view = v; buildViewsActive(); refresh(); } };
const buildViewsActive = () => { for (const b of $('views').children) b.classList.toggle('active', b.dataset.view === st.view); };
$('truth').onchange = e => { st.truth = e.target.checked; refresh(); };
$('colorBy').onchange = e => { st.colorBy = e.target.value; refresh(); };
$('envMode').onchange = e => { st.env = e.target.value; if (run) { run.envMode = st.env; run.classify(); } refresh(); };
$('stack').onchange = e => { st.stack = e.target.checked; refresh(); };
$('snapRange').oninput = e => { st.snap = Number(e.target.value); refresh(); };
$('iterRange').oninput = e => { st.iter = Number(e.target.value); refresh(); };
$('theoryRange').oninput = e => { st.theory = Number(e.target.value); refresh(); };

async function busy(fn) {
  $('busy').style.display = 'block';
  await new Promise(r => setTimeout(r, 20));
  try { fn(); } catch (e) { console.error(e); showBanner('Error: ' + e.message); }
  $('busy').style.display = 'none';
  refresh();
}
const showBanner = msg => { $('banner').textContent = msg; $('banner').style.display = msg ? 'block' : 'none'; };

function play(kind) {
  clearInterval(timer);
  const n = kind === 'snap' ? run.sup.snaps.length : run.theories[0].snaps?.length || 0;
  let k = 0;
  timer = setInterval(() => {
    st[kind] = k++;
    refresh();
    if (k >= n) clearInterval(timer);
  }, kind === 'snap' ? 500 : 50);
}

document.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => busy(() => {
  if (!run || run.scn.unavailable) return;
  const s = b.dataset.stage;
  st.snap = -1; st.iter = -1;
  if (s === 'compile') { run.compile(); st.view = 'data'; }
   if (s === 'rebuild') { run.rebuild(); st.view = 'partition'; }
  if (s === 'supportStep') { run.support(true); st.view = 'contraction'; st.snap = run.sup.snaps.length - 1; }
  if (s === 'support') { run.support(); st.view = 'contraction'; setTimeout(() => play('snap'), 0); }
  if (s === 'solve') { run.solve(); st.view = 'mass'; setTimeout(() => play('iter'), 0); }
  if (s === 'challenge') { run.challenge(); st.view = 'theory'; }
  if (s === 'bounds') { run.bounds(); st.view = 'envelope'; }
  if (s === 'all') { run.runAll(); st.view = 'status'; }
  buildViewsActive();
}));

$('sweepBtn').onclick = () => busy(() => {
  const widths = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  st.sweep = widthSweep(st.params, widths);
});
$('exportBtn').onclick = () => {
  if (!run) return;
  const blob = new Blob([JSON.stringify(run.exportJSON(), null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `cutt-${st.params.scenario}-seed${st.params.seed}.json` });
  a.click();
};

// picking (ignore drags)
let down = null;
sc.renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
sc.renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = sc.renderer.domElement.getBoundingClientRect();
  sc.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), sc.camera);
  st.sel = pickObs(run, sc.raycaster);
  st.hl = null;
  refresh();
});
$('inspector').onclick = e => {
  const t = e.target.closest('.prov');
  if (!t) return;
  st.hl = { leaf: Number(t.dataset.leaf), anchors: t.dataset.anchors ? t.dataset.anchors.split(',').map(Number) : [] };
  refresh();
};

function rebuild() {
  clearInterval(timer);
  saveHash();
  showBanner('');
  st.sel = -1; st.theory = 0; st.snap = -1; st.iter = -1; st.hl = null;
  try { run = new Run(st.params); } catch (e) { console.error(e); run = null; showBanner('Error: ' + e.message); }
  if (run && run.scn.unavailable) showBanner(run.scn.narrative);
  if (run && run.prob.d === 3) { sc.camera.position.set(14, 14, 14); sc.controls.target.set(0, 5, 0); }
  else { sc.camera.position.set(0, 13, 13); sc.controls.target.set(0, 1, 0); }
  refresh();
}

function metricsTable() {
  if (!run || run.scn.unavailable) return '';
  const m = run.metrics();
  const clean = run.p.noise === 0;
  const row = (name, v, b5 = '', or = '', fail = false) =>
    `<tr class="${fail ? 'fail' : ''}"><td>${name}</td><td>${v}</td><td>${b5}</td><td>${or}</td></tr>`;
  const f = v => (isFinite(v) ? v.toFixed(3) : '–');
  let h = '<table><tr><th>metric</th><th>fitted</th><th>B5</th><th>B6-T</th></tr>';
  h += row('M2a mean log true-cell', f(m.m2a), f(m.b5), f(m.oracle));
  h += row('M2a frac ≥ 0.5', f(m.m2aFrac), f(m.b5Frac), f(m.oracleFrac));
  h += row('M2b IG (support + weights)', `${f(m.ig)} (${f(m.igS)} + ${f(m.igW)})`, '0', '', m.ig < 0);
  h += row('M3 tightening', f(m.tight));
  h += row('M4 false exclusion', f(m.falseExcl), '', '', clean && m.falseExcl > 0);
  if (m.falseExcl > 0) h += row('&nbsp;by depth', Object.entries(m.feDepth).map(([k, v]) => `${k}:${v}`).join(' '));
  h += row('M5 false certainty (fit / env)', `${f(m.m5fit)} / ${f(m.m5env)}`, '', '', m.m5fit > 0.05);
  h += row('M6 ECE', f(m.ece));
  h += row('M8 theories', m.nTheories + (run.ch ? ` (${run.ch.stopReason})` : ''));
  if (run.theories) h += row('F, L (θ0)', `${f(run.theories[0].F)}, ${f(run.theories[0].L)}`);
  if (run.sup) h += row('sweeps / contradictions / inconsistencies', `${run.sup.sweeps} / ${run.sup.contradictions.length} / ${run.sup.inconsistencies.length}`);
  const T = run.table;
  let anchors = 0;
  for (let i = 0; i < T.N; i++) if (T.start[i + 1] - T.start[i] === 1) anchors++;
  h += row('fragments / per obs / anchor frac', `${T.n} / ${f(T.n / T.N)} / ${f(anchors / T.N)}`);
   if (run.scn.learned) h += row('leaves / criterion', `${run.tree.leaves.length} / ${run.p.crit}`);
   if (run.rebuildLog) h += row('rebuild iterations', run.rebuildLog.length);
  if (run.evalRec.info.occupancy !== undefined) h += row('off-diagonal occupancy', f(run.evalRec.info.occupancy));
  const sf = run.statusFractions();
  if (sf) h += row('status (obs)', STATUS.map((s, k) => sf[k] ? `${s[0]}${s[1]}:${(sf[k] * 100).toFixed(0)}%` : '').join(' '));
  return h + '</table>';
}
// Viewport caption and colour legend, so every view explains itself.
const hex = c => '#' + c.toString(16).padStart(6, '0');
function renderGuide() {
   $('viewHelp').innerHTML = `<b>${st.view} view</b><br>${VIEW_HELP[st.view]}`;
   const C = run ? run.prob.C : 2;
   let h = '<div class="legend-row"><b>Classes</b>' +
     CLASS_COLORS.slice(0, C).map((c, k) => `<span><span class="sw" style="background:${hex(c)}"></span>class ${k}</span>`).join('') +
     '<span><span class="sw dash"></span>partial label</span></div>';
   if (st.view === 'status') {
     h += '<div class="legend-row"><b>Epistemic status</b>' +
       STATUS.map((s, k) => `<span><span class="sw" style="background:${hex(STATUS_COLORS[k])}"></span>${s}</span>`).join('') + '</div>';
   }
   if (st.view === 'contraction') h += '<div class="legend-row"><b>Slabs</b><span><span class="sw" style="background:#D55E00"></span>removed by anchors</span></div>';
   if (st.view === 'mass') h += '<div class="legend-row"><b>Height</b><span>blue → red = low → high density</span></div>';
   $('legend').innerHTML = h;
}


function refresh() {
  renderScene(group, run, st);
   renderGuide();
  if (!run) return;
  $('narrative').innerHTML = `<b>${run.scn.id} — ${run.scn.name}</b> <span class="muted">(${run.scn.maps})</span><br>${run.scn.narrative || ''}`;
  let checks = '';
  try { checks = run.checks().map(([n, ok]) => `<span class="badge ${ok ? 'pass' : 'failb'}">${ok ? '✓' : '✗'} ${n}</span>`).join(''); }
  catch (e) { checks = `<span class="muted">${e.message}</span>`; }
  $('checks').innerHTML = checks;
  $('metrics').innerHTML = metricsTable();
  renderInspector($('inspector'), run, st.sel, st);
  // scrubbers
  const ns = run.sup ? run.sup.snaps.length - 1 : 0;
  Object.assign($('snapRange'), { max: ns }); $('snapV').textContent = st.snap < 0 ? 'final' : st.snap;
  const ni = run.theories?.[0].snaps ? run.theories[0].snaps.length - 1 : 0;
  Object.assign($('iterRange'), { max: ni }); $('iterV').textContent = st.iter < 0 ? 'final' : st.iter;
  const nt = run.theories ? run.theories.length - 1 : 0;
  Object.assign($('theoryRange'), { max: nt }); $('theoryV').textContent = run.theories ? `${Math.min(st.theory, nt)} / ${nt + 1}` : '–';
  // minimaps
  const mm = $('minimaps');
  mm.innerHTML = '';
  if (run.theories && run.prob.d === 2) run.theories.forEach((th, k) => {
    const cv = Object.assign(document.createElement('canvas'), { width: 80, height: 80, title: `theory ${k}: F=${th.F.toFixed(2)} ${th.source || ''}` });
    drawMinimap(cv, run, th, leafOfPoint);
    mm.append(cv);
  });
  // charts
  const curve = run.ch ? run.ch.curve : [];
  plotXY($('chartDiv'), [
    { label: 'latent D', color: '#0072B2', pts: curve.map(r => [r.dF, r.D, r.accepted]) },
    { label: 'pred. disagreement', color: '#E69F00', pts: curve.map(r => [r.dF, r.pd, r.accepted]) },
  ], { xlabel: 'ΔF (budget ' + (run.ch ? (run.ch.budget - run.theories[0].F).toFixed(2) : '–') + ')', empty: 'run Challenge' });
  const it = run.theories?.[0].snaps ? run.iterMetrics() : null;
  plotXY($('chartIter'), it ? [
    { label: 'confidence', color: '#0072B2', mode: 'line', pts: it.map(r => [r.iter, r.conf]) },
    { label: 'true-cell mass', color: '#009E73', mode: 'line', pts: it.map(r => [r.iter, r.truth]) },
    { label: 'M5', color: '#D55E00', mode: 'line', pts: it.map(r => [r.iter, r.m5]) },
  ] : [], { y0: 0, y1: 1, xlabel: 'iteration', empty: 'run Solve' });
  const rel = run.metrics().rel;
  plotXY($('chartRel'), [
    { label: 'diagonal', color: '#bbb', mode: 'line', pts: [[0, 0], [1, 1]] },
    { label: 'empirical', color: '#0072B2', pts: rel.filter(b => b.n).map(b => [b.mean, b.freq]) },
  ], { x0: 0, x1: 1, y0: 0, y1: 1, xlabel: 'cell mass' });
  const sw = st.sweep && st.sweep[0] && st.sweep;
  plotXY($('chartSweep'), sw ? [
    { label: 'M3 tightening', color: '#0072B2', mode: 'line', pts: sw.map(r => [r.width, r.tight]) },
    { label: 'M2b IG (/3)', color: '#009E73', mode: 'line', pts: sw.map(r => [r.width, r.ig / 3]) },
    { label: 'theories (/6)', color: '#CC79A7', mode: 'line', pts: sw.map(r => [r.width, r.nTheories / 6]) },
    { label: 'Underdet. frac', color: '#999', mode: 'line', pts: sw.map(r => [r.width, r.statusFrac ? r.statusFrac[5] : NaN]) },
    { label: 'M4', color: '#D55E00', mode: 'line', pts: sw.map(r => [r.width, r.falseExcl]) },
  ] : [], { xlabel: 'width', empty: 'press Width sweep' });
  // status bar
  const ov = Object.entries(run.p.overrides).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
  $('statusbar').innerHTML = `preset <b>${run.p.preset}</b>; overrides: ${ov}; topology ${run.tree.id}; view <b>${st.view}</b>` +
    (st.view === 'partition' ? ` — tiles coloured by ${st.colorBy === 'phi' ? 'φ (soft, fitted)' : 'anchor counts (hard)'}` : '') +
    (st.view === 'theory' ? ' — tiles coloured by φ of selected theory (soft)' : '') +
    (st.view === 'envelope' ? ' — <span style="color:#a33">Not certified bounds (§5.6)</span>' : '') +
    (st.view === 'status' ? ` — conditional on topology: ${run.tree.id}` : '') +
    (st.truth ? ' — latent truth shown (evaluation only)' : '');
  $('warn').style.display = run.broken ? 'block' : 'none';
  if (run.violations.length) showBanner(`Invariant violation: ${run.violations.slice(0, 3).join('; ')}${run.violations.length > 3 ? ' …' : ''}`);
}

buildControls();
rebuild();