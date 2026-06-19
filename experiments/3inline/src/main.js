import { Config } from './core/config.js';
import { parabolaWarmStart } from './constructions/parabola.js';
import { Solver } from './search/solver.js';
import { Renderer } from './ui/renderer.js';
import { findViolation, History } from './ui/manualMode.js';
import { MetricsChart } from './ui/metrics.js';

const $ = (id) => document.getElementById(id);

let n = 10;
let config = new Config(n);
let mode = 'manual';
let solver = null;
let running = false;
let rafId = null;
let violation = null;

const canvas = $('grid');
const renderer = new Renderer(canvas);
const chart = new MetricsChart($('chart'), 2 * n);
const history = new History();
history.push(config.selected);

function target() {
  return 2 * n;
}

function refreshMetrics() {
  $('mCount').textContent = config.pointCount;
  $('mTarget').textContent = target();
  $('mFrontier').textContent = config.frontier.frontierCells(config.selected).length;
  $('mSat').textContent = config.isSaturated() ? 'YES' : 'no';
  if (solver) {
    $('mBest').textContent = solver.best.pointCount;
    $('mStep').textContent = solver.step;
  }
}

function render() {
  renderer.draw(config, { violation });
  refreshMetrics();
}

// ---------- Mode switching ----------
function setMode(m) {
  mode = m;
  $('modeManual').classList.toggle('active', m === 'manual');
  $('modeAuto').classList.toggle('active', m === 'auto');
  $('manualControls').style.display = m === 'manual' ? '' : 'none';
  $('autoControls').style.display = m === 'auto' ? '' : 'none';
  stopRun();
  if (m === 'auto') initSolver();
  render();
}

function initSolver() {
  solver = new Solver(n, {
    config: config.clone(),
    temperature: parseInt($('tSlider').value) / 100,
    cooling: parseInt($('cSlider').value) / 10000,
    subSize: parseInt($('ssSlider').value),
  });
  solver.on('step', (s) => {
    config = solver.config;
    renderer.activeSub = null;
    chart.push(s.count);
    $('mEntropy').textContent = s.entropy.toFixed(2);
    if (s.diagonal !== undefined) $('mDiagonal').textContent = s.diagonal.toFixed(2);
    $('tLabel').textContent = s.temperature.toFixed(2);
    if (s.acceptRate !== undefined && $('mAccept'))
      $('mAccept').textContent = (s.acceptRate * 100).toFixed(0) + '%';
  });
  solver.on('accept', (res) => {
    if (res.sub) renderer.activeSub = res.sub;
  });
  solver.on('restart', () => {
    renderer.activeSub = null;
  });
}

// ---------- Grid resize ----------
function setN(newN) {
  n = newN;
  $('nLabel').textContent = n;
  config = new Config(n);
  chart.setTarget(target());
  chart.reset();
  history.stack = [];
  history.ptr = -1;
  history.push(config.selected);
  if (mode === 'auto') initSolver();
  violation = null;
  render();
}

// ---------- Manual interaction ----------
canvas.addEventListener('mousemove', (e) => {
  if (mode !== 'manual') return;
  renderer.hoverCell = renderer.cellFromEvent(e, n);
  render();
});
canvas.addEventListener('mouseleave', () => {
  renderer.hoverCell = null;
  render();
});

canvas.addEventListener('click', (e) => {
  if (mode !== 'manual') return;
  const cell = renderer.cellFromEvent(e, n);
  if (!cell) return;
  const [x, y] = cell;
  violation = null;
  if (config.has(x, y)) {
    config.remove(x, y);
    history.push(config.selected);
  } else {
    if (config.add(x, y)) {
      history.push(config.selected);
    } else {
      const v = findViolation(config, [x, y]);
      if (v) {
        violation = v;
        setTimeout(() => {
          violation = null;
          render();
        }, 1200);
      }
    }
  }
  render();
});

// ---------- Rebuild config from a selected set (undo/redo/load) ----------
function rebuildFrom(selectedSet) {
  const c = new Config(n);
  for (const id of selectedSet) {
    const x = id % n,
      y = Math.floor(id / n);
    c.forceAdd(x, y);
  }
  config = c;
}

// ---------- Run loop ----------
function tick() {
  if (!running) return;
  solver.run(50);
  config = solver.config;
  render();
  rafId = requestAnimationFrame(tick);
}
function startRun() {
  if (mode !== 'auto') return;
  if (!solver) initSolver();
  running = true;
  tick();
}
function stopRun() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
}

// ---------- Control bindings ----------
$('nSlider').addEventListener('input', (e) => setN(parseInt(e.target.value)));
$('modeManual').addEventListener('click', () => setMode('manual'));
$('modeAuto').addEventListener('click', () => setMode('auto'));

$('btnWarmStart').addEventListener('click', () => {
  config = parabolaWarmStart(n);
  history.push(config.selected);
  if (mode === 'auto') {
    initSolver();
  }
  render();
});

$('btnClear').addEventListener('click', () => {
  config = new Config(n);
  history.push(config.selected);
  if (mode === 'auto') initSolver();
  chart.reset();
  render();
});

$('btnUndo').addEventListener('click', () => {
  const s = history.undo();
  if (s) {
    rebuildFrom(s);
    render();
  }
});
$('btnRedo').addEventListener('click', () => {
  const s = history.redo();
  if (s) {
    rebuildFrom(s);
    render();
  }
});
$('btnHint').addEventListener('click', () => {
  const cells = config.frontier.frontierCells(config.selected);
  if (cells.length) {
    renderer.hoverCell = cells[Math.floor(Math.random() * cells.length)];
    render();
    setTimeout(() => {
      renderer.hoverCell = null;
      render();
    }, 1500);
  } else {
    alert('Saturated — no safe cell. Try rearranging (auto-solve).');
  }
});

$('btnStep').addEventListener('click', () => {
  if (!solver) initSolver();
  solver.stepOnce();
  config = solver.config;
  render();
});
$('btnRun').addEventListener('click', startRun);
$('btnPause').addEventListener('click', stopRun);
$('btnEscape').addEventListener('click', () => {
  if (solver) {
    solver.escape();
    render();
  }
});
// Keyboard shortcuts: space = step (auto), r = run/pause toggle.
document.addEventListener('keydown', (e) => {
  if (mode !== 'auto') return;
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!solver) initSolver();
    solver.stepOnce();
    config = solver.config;
    render();
  } else if (e.key === 'r') {
    running ? stopRun() : startRun();
  }
});

$('tSlider').addEventListener('input', (e) => {
  $('tLabel').textContent = (parseInt(e.target.value) / 100).toFixed(2);
  if (solver) solver.temperature = parseInt(e.target.value) / 100;
});
$('cSlider').addEventListener('input', (e) => {
  const c = parseInt(e.target.value) / 10000;
  $('cLabel').textContent = c.toFixed(4);
  if (solver) solver.cooling = c;
});
$('ssSlider').addEventListener('input', (e) => {
  $('ssLabel').textContent = e.target.value;
  if (solver) solver.subSize = parseInt(e.target.value);
});

['ovLines', 'ovFrontier', 'ovHeatmap', 'ovSublattice'].forEach((id) => {
  $(id).addEventListener('change', (e) => {
    const key = id.replace('ov', '').toLowerCase();
    renderer.overlays[key] = e.target.checked;
    render();
  });
});

// ---------- Init ----------
renderer.overlays.lines = $('ovLines').checked;
renderer.overlays.frontier = $('ovFrontier').checked;
renderer.overlays.heatmap = $('ovHeatmap').checked;
renderer.overlays.sublattice = $('ovSublattice').checked;
render();
