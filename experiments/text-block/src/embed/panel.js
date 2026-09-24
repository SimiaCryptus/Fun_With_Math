import { PRESETS, PRESET_KEYS } from './params.js';

/** Parameter panel, action buttons, readouts, and a sparkline helper. */

const FIELDS = [
  { group: 'graph' },
  { key: 'preset', type: 'select', options: ['context', 'substitution', 'ring', 'follow', 'custom'], title: 'Parameter preset' },
  { key: 'window', label: 'window K', type: 'pair', int: true, title: 'Column window [kMin, kMax] relative to the origin (clamped to n columns)' },
  { key: 'followView', label: 'follow view', type: 'check', title: 'Use the visible columns of the block as the window (rebuilds after dragging)' },
  { key: 'radius', label: 'radius r, k', type: 'pair', int: true, min: 0, title: 'Neighbourhood radius in rows and columns' },
  { key: 'sigma', label: 'σ r, k', type: 'pair', step: 0.1, min: 0.05, title: 'Kernel scale per axis' },
  { key: 'kernel', type: 'select', options: ['gaussian', 'inverse', 'box'] },
  { key: 'alpha', label: 'α (ring)', type: 'number', step: 0.05, min: 0, title: 'Weight of horizontal (same-row) pairs' },
  { key: 'beta', label: 'β (context)', type: 'number', step: 0.05, min: 0, title: 'Weight of vertical / diagonal pairs' },
  { key: 'columnFocus', label: 'focus k₀', type: 'number', step: 1, nullable: true, title: 'Column emphasis centre (blank = off)' },
  { key: 'columnTau', label: 'focus τ', type: 'number', step: 0.5, min: 0.1 },
  { key: 'lcpGate', label: 'LCP gate', type: 'select', options: ['off', 'hard', 'soft'] },
  { key: 'lcpMin', label: 'ℓmin', type: 'number', int: true, min: 0 },
  { key: 'lcpCap', label: 'ℓcap', type: 'number', int: true, min: 1 },
  { key: 'cyclicRows', label: 'cyclic rows', type: 'check', title: 'Link the last row to the first' },
  { group: 'optimizer' },
  { key: 'optimizer', type: 'select', options: ['contrastive', 'diffuse'] },
  { key: 'dim', label: 'dim d', type: 'number', int: true, min: 1, max: 32 },
  { key: 'lr', label: 'lr', type: 'number', step: 0.01, min: 0 },
  { key: 'momentum', type: 'number', step: 0.05, min: 0, max: 0.99 },
  { key: 'lambda', label: 'λ (uniformity)', type: 'number', step: 0.1, min: 0 },
  { key: 't', label: 't', type: 'number', step: 0.1, min: 0.01 },
  { key: 'eta', label: 'η (diffuse)', type: 'number', step: 0.05, min: 0.01, max: 1 },
  { key: 'glyphTying', label: 'glyph tying μ', type: 'number', step: 0.1, min: 0 },
  { key: 'seed', type: 'number', int: true },
  { key: 'stepsPerFrame', label: 'steps / frame', type: 'number', int: true, min: 1, max: 500 },
   { group: 'layout' },
   {
     key: 'layout', label: 'scatter layout', type: 'select',
     options: ['pca', 'tsne', 'mds', 'raw'],
     labels: { pca: 'PCA', tsne: 't-SNE', mds: 'metric MDS', raw: 'axes 1–2' },
     title: '2-D projection of the embedding shown in the scatter',
   },
   { key: 'perplexity', label: 't-SNE perplexity', type: 'number', step: 1, min: 2, max: 100, title: 'Effective neighbourhood size (clamped to (n − 1) / 3)' },
   { key: 'layoutSteps', label: 'layout steps / frame', type: 'number', int: true, min: 1, max: 200, title: 't-SNE / MDS iterations per animation frame' },
];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(text, title, onClick) {
  const b = el('button', null, text);
  b.type = 'button';
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function check(text, title, onChange) {
  const label = el('label', 'toggle');
  label.title = title;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.addEventListener('change', () => onChange(input.checked));
  label.append(input, ` ${text}`);
  return { label, input };
}

function numberInput(f) {
  const i = document.createElement('input');
  i.type = 'number';
  i.step = f.step ?? (f.int ? 1 : 'any');
  if (f.min != null) i.min = f.min;
  if (f.max != null) i.max = f.max;
  return i;
}

function parseNum(f, raw) {
  const s = String(raw).trim();
  if (s === '') return f.nullable ? null : undefined;
  let x = parseFloat(s);
  if (!Number.isFinite(x)) return undefined;
  if (f.int) x = Math.round(x);
  if (f.min != null) x = Math.max(f.min, x);
  if (f.max != null) x = Math.min(f.max, x);
  return x;
}

export function drawSparkline(canvas, values, color = '#00ff66') {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const vals = values ? Array.from(values).filter(Number.isFinite) : [];
  if (vals.length < 2) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vals) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = hi - lo || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = dpr;
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = (i / (vals.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - lo) / span) * (h - 2);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
}

const fmt = (x, digits = 3) => (Number.isFinite(x) ? Number(x.toPrecision(digits)).toString() : '—');

export function createPanel(root, { params, canRun = true, onChange, onAction }) {
  let current = params;
  root.replaceChildren();

  // ---- actions
  const actions = el('div', 'embed-actions');
  const runBtn = button('run', 'Run / pause the optimizer', () => onAction('run'));
  const stepBtn = button('step', 'Advance by one frame (steps / frame iterations)', () => onAction('step'));
  const solveBtn = button('solve', 'Run the diffuse iteration to convergence (Laplacian eigenmap)', () => onAction('solve'));
  const reseedBtn = button('reseed', 'Restart from fresh seed vectors', () => onAction('reseed'));
  const jsonBtn = button('json', 'Export embedding, parameters and graph as JSON', () => onAction('export-json'));
  const csvBtn = button('csv', 'Export id, pos, char, x_1..x_d as CSV', () => onAction('export-csv'));
  const viewBtn = button('fit', 'Reset scatter pan / zoom (or double-click the plot)', () => onAction('resetView'));
  const colorBox = check('colour block', 'Colour the block by embedding (selection still wins)', (v) => onAction('colorBlock', v));
  const edgeBox = check('edges', 'Draw the strongest edges per node', (v) => onAction('edges', v));
  actions.append(runBtn, stepBtn, solveBtn, reseedBtn, jsonBtn, csvBtn, viewBtn, colorBox.label, edgeBox.label);

  // ---- readouts
  const readouts = el('div', 'embed-readouts');
  const out = {};
  function readout(key, label, title) {
    const s = el('span');
    if (title) s.title = title;
    s.append(`${label} `);
    const b = el('b', null, '—');
    s.append(b);
    out[key] = b;
    readouts.append(s);
    return s;
  }
  const lossSpan = readout('loss', 'loss');
  const spark = el('canvas', 'spark');
  lossSpan.append(' ', spark);
  readout('rank', 'eff. rank', 'Effective rank of the centred covariance (≈1 = collapse)');
  readout('purity', 'kNN purity', 'Fraction of 5 nearest neighbours sharing the glyph');
  readout('smooth', 'ring smooth', 'Mean ‖x_p − x_p+1‖ / mean distance of random pairs');
  readout('edges', 'edges');
  readout('iter', 'iter');
   readout('layout', 'layout', '2-D projection method and its objective (t-SNE KL / MDS stress)');

  const status = el('div', 'embed-status');

  // ---- parameters
  const details = el('details', 'embed-params');
  details.open = true;
  details.append(el('summary', null, 'parameters'));
  const grid = el('div', 'fields');
  const inputs = new Map();

  for (const f of FIELDS) {
    if (f.group) {
      grid.append(el('div', 'group-title', f.group));
      continue;
    }
    const label = el('label', 'field');
    if (f.title) label.title = f.title;
    label.append(el('span', null, f.label ?? f.key));
    let els;
    if (f.type === 'select') {
      const s = document.createElement('select');
      for (const o of f.options) {
        const opt = document.createElement('option');
        opt.value = o;
         opt.textContent = f.labels?.[o] ?? o;
        s.append(opt);
      }
      s.addEventListener('change', () => commit(f));
      els = [s];
      label.append(s);
    } else if (f.type === 'check') {
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.addEventListener('change', () => commit(f));
      els = [i];
      label.append(i);
    } else if (f.type === 'pair') {
      const a = numberInput(f);
      const b = numberInput(f);
      a.addEventListener('change', () => commit(f));
      b.addEventListener('change', () => commit(f));
      const span = el('span', 'pair');
      span.append(a, b);
      els = [a, b];
      label.append(span);
    } else {
      const i = numberInput(f);
      i.addEventListener('change', () => commit(f));
      els = [i];
      label.append(i);
    }
    grid.append(label);
    inputs.set(f.key, { f, els });
  }
  details.append(grid);

  root.append(actions, readouts, status, details);

  function read(f, els) {
    if (f.type === 'select') return els[0].value;
    if (f.type === 'check') return els[0].checked;
    if (f.type === 'pair') {
      const a = parseNum(f, els[0].value);
      const b = parseNum(f, els[1].value);
      return a == null || b == null ? undefined : [a, b];
    }
    return parseNum(f, els[0].value);
  }

  function commit(f) {
    const v = read(f, inputs.get(f.key).els);
    if (v === undefined) {
      update(current);
      return;
    }
    let patch = { [f.key]: v };
    if (f.key === 'preset') {
      if (v !== 'custom') patch = { preset: v, ...PRESETS[v] };
    } else if (PRESET_KEYS.has(f.key)) {
      patch.preset = 'custom';
    }
    onChange(patch);
  }

  function update(p) {
    current = p;
    for (const [key, { f, els }] of inputs) {
      const v = p[key];
      if (f.type === 'check') els[0].checked = !!v;
      else if (f.type === 'pair') {
        els[0].value = v?.[0] ?? '';
        els[1].value = v?.[1] ?? '';
      } else els[0].value = v == null ? '' : String(v);
    }
  }

  function setRunning(running, can = canRun) {
    runBtn.textContent = running ? 'pause' : 'run';
    runBtn.setAttribute('aria-pressed', String(running));
    runBtn.disabled = !can;
    if (!can) runBtn.title = 'Auto-run is disabled (prefers-reduced-motion); use step or solve';
  }

  function setReadouts(r) {
    if (!r) {
      for (const b of Object.values(out)) b.textContent = '—';
      drawSparkline(spark, null);
      return;
    }
    out.loss.textContent = fmt(r.loss, 4);
    out.rank.textContent = fmt(r.rank, 3);
    out.purity.textContent = Number.isFinite(r.purity) ? `${(r.purity * 100).toFixed(0)}%` : '—';
    out.smooth.textContent = fmt(r.smooth, 3);
    out.edges.textContent = String(r.edges ?? '—');
    out.iter.textContent = String(r.iter ?? '—');
     out.layout.textContent = r.layout ?? '—';
    drawSparkline(spark, r.hist);
  }

  update(params);
  setRunning(false, canRun);

  return {
    update,
    setRunning,
    setReadouts,
    setStatus(text) { status.textContent = text; },
    setColorBlock(v) { colorBox.input.checked = !!v; },
  };
}