const PALETTE = [
  '#4f9dde',
  '#e0685a',
  '#5ac47a',
  '#d9a94b',
  '#a878e0',
  '#4ec9c9',
  '#e07ab5',
  '#9bcf4b',
  '#7f8cff',
  '#ff9f4b',
];

const state = {
  manifest: null,
  /** flattened list of selectable series (one per run) */
  series: [],
  /** Map<seriesId, loadedRunResult> */
  loaded: new Map(),
  selected: new Set(),
  chart: null,
};

const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  $('status').textContent = msg;
}

/**
 * Normalize the schema's `activation` field (string | string[] | null)
 * into a compact display string. Per-layer lists are collapsed: a single
 * unique value is shown bare, otherwise joined by "/".
 */
function normalizeActivation(act) {
  if (act === null || act === undefined) return null;
  if (Array.isArray(act)) {
    if (!act.length) return null;
    const uniq = [...new Set(act.map((a) => String(a)))];
    return uniq.length === 1 ? uniq[0] : uniq.join('/');
  }
  return String(act);
}

/** Serialize current filters + selection (by run name) into the URL. */
function syncUrl() {
  const params = new URLSearchParams();
  const q = $('search').value.trim();
  if (q) params.set('q', q);
  if ($('filterActivation').value) params.set('act', $('filterActivation').value);
  if ($('xaxis').value !== 'time_rel') params.set('x', $('xaxis').value);
  if (!$('logY').checked) params.set('logy', '0');
  if ($('theme').value !== 'dark') params.set('theme', $('theme').value);
  // Persist selection by run name (disambiguated by the active filters).
  const names = [...state.selected]
    .map((id) => state.series.find((s) => s.id === id)?.runName)
    .filter(Boolean);
  if (names.length) params.set('sel', names.join('|'));
  const url = `${location.pathname}?${params.toString()}`;
  history.replaceState(null, '', url);
}

/** Apply filters + selection from the URL. Call after series are built. */
function applyUrl() {
  const p = new URLSearchParams(location.search);
  $('search').value = p.get('q') ?? '';
  $('filterActivation').value = p.get('act') ?? '';
  $('xaxis').value = p.get('x') ?? 'time_rel';
  $('logY').checked = p.get('logy') !== '0';
  setTheme(p.get('theme') ?? 'dark');
  return (p.get('sel') ?? '').split('|').filter(Boolean);
}

function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  $('theme').value = name;
}

/** Populate the activation filter dropdown from available series. */
function populateActivations() {
  const sel = $('filterActivation');
  const current = sel.value;
  const acts = [...new Set(state.series.map((s) => s.activation).filter(Boolean))].sort();
  sel.innerHTML =
    '<option value="">All activations</option>' +
    acts.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
  if (acts.includes(current)) sel.value = current;
}

/** Return the filtered series list using all active filters. */
function filteredSeries() {
  const q = $('search').value.trim().toLowerCase();
  const actFilter = $('filterActivation').value;
  return state.series.filter((s) => {
    if (actFilter && s.activation !== actFilter) return false;
    if (!q) return true;
    return (
      s.runName.toLowerCase().includes(q) ||
      (s.arch ?? '').toLowerCase().includes(q) ||
      (s.dataset ?? '').toLowerCase().includes(q) ||
      (s.activation ?? '').toLowerCase().includes(q) ||
      s.path.toLowerCase().includes(q)
    );
  });
}

/**
 * Re-resolve the current selection against the (possibly changed) filter,
 * matching by run name. First matching entry in the filtered list wins.
 * Used when filters change so equivalent plots stay linked by name.
 */
async function reresolveSelection(names) {
  const filtered = filteredSeries();
  const newSelected = new Set();
  for (const name of names) {
    const match = filtered.find((s) => s.runName === name);
    if (match) {
      newSelected.add(match.id);
      await ensureLoaded(match.id);
    }
  }
  state.selected = newSelected;
}

function colorFor(id) {
  // stable-ish color assignment by selection order
  const idx = [...state.selected].indexOf(id);
  return PALETTE[(idx >= 0 ? idx : id.length) % PALETTE.length];
}

/**
 * Build the flat list of series from the manifest. Experiment artifacts
 * expand into one series per contained run.
 */
function buildSeries(manifest) {
  const series = [];
  for (const entry of manifest.entries ?? []) {
    const activation = normalizeActivation(
      entry.topology?.activation ?? entry.topology?.act ?? entry.activation ?? null
    );
    const created = entry.created_at ?? entry.timestamp ?? entry.time ?? null;
    if (entry.kind === 'optimizer_run') {
      series.push({
        id: `${entry.path}#${entry.run?.name ?? 'run'}`,
        path: entry.path,
        kind: entry.kind,
        runName: entry.run?.name ?? entry.optimizer?.name ?? '(run)',
        arch: entry.topology?.arch ?? null,
        dataset: entry.dataset?.name ?? null,
        activation,
        created,
        summary: entry.run ?? null,
      });
    } else if (entry.kind === 'experiment') {
      for (const run of entry.runs ?? []) {
        series.push({
          id: `${entry.path}#${run?.name}`,
          path: entry.path,
          kind: entry.kind,
          runName: run?.name ?? '(run)',
          arch: entry.topology?.arch ?? null,
          dataset: entry.dataset?.name ?? null,
          activation,
          created,
          summary: run ?? null,
        });
      }
    } else {
      series.push({
        id: entry.path,
        path: entry.path,
        kind: entry.kind,
        runName: entry.path,
        arch: entry.topology?.arch ?? null,
        dataset: entry.dataset?.name ?? null,
        activation,
        created,
        summary: null,
      });
    }
  }
  return series;
}

function fmt(v, digits = 4) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (typeof v !== 'number') return String(v);
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5)) {
    return v.toExponential(2);
  }
  return Number(v.toFixed(digits)).toString();
}

function renderList() {
  const list = $('runList');
  list.innerHTML = '';

  const filtered = filteredSeries();

  if (!filtered.length) {
    list.innerHTML =
      '<div style="color:var(--muted);padding:8px;font-size:12px">No matching runs.</div>';
    return;
  }

  for (const s of filtered) {
    const div = document.createElement('div');
    div.className = 'run-item' + (state.selected.has(s.id) ? ' selected' : '');
    const sel = state.selected.has(s.id);
    const sm = s.summary;
    div.innerHTML = `
        <div class="title">
          <span>${sel ? `<span class="swatch" style="background:${colorFor(s.id)}"></span>` : ''}${escapeHtml(s.runName)}</span>
          <span class="badge">${s.kind}</span>
        </div>
        <div class="meta">
         ${s.dataset ? escapeHtml(s.dataset) + ' · ' : ''}${s.arch ? escapeHtml(s.arch) : escapeHtml(s.path)}${s.activation ? ' · ' + escapeHtml(s.activation) : ''}
        </div>
        ${sm ? `<div class="meta">final ${fmt(sm.final_loss)} · iters ${fmt(sm.iters, 0)} · test ${fmt(sm.test_acc)}${sm.reached ? ' · ✓target' : ''}</div>` : ''}
      `;
    div.addEventListener('click', () => toggleSelect(s.id));
    list.appendChild(div);
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]
  );
}

async function toggleSelect(id) {
  if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    state.selected.add(id);
    await ensureLoaded(id);
  }
  renderList();
  renderChart();
  renderSummary();
}

/**
 * Load the actual RunResult (with full trajectories) for a series id.
 */
async function ensureLoaded(id) {
  if (state.loaded.has(id)) return;
  const s = state.series.find((x) => x.id === id);
  if (!s) return;
  setStatus(`Loading ${s.path}…`);
  try {
    const res = await fetch(`${s.path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    let run = null;
    if (json.kind === 'optimizer_run') {
      run = json.result;
    } else if (json.kind === 'experiment') {
      run = json.results?.[s.runName] ?? null;
    }
    state.loaded.set(id, run);
    setStatus(`Loaded ${s.runName}.`);
  } catch (err) {
    state.loaded.set(id, null);
    setStatus(`Failed to load ${s.path}: ${err.message}`);
  }
}

function buildDataForRun(run, xaxis) {
  if (!run || !Array.isArray(run.history)) return [];
  const y = run.history;
  const times = Array.isArray(run.times) ? run.times : null;
  const evals = Array.isArray(run.eval_counts) ? run.eval_counts : null;
  let x;
  if (xaxis === 'time_rel' && times) {
    // Subtract the time at iteration=2 to discount JIT warmup so
    // curves are aligned on steady-state wall time.
    const warmupIdx = Math.min(2, times.length - 1);
    const base = times[warmupIdx] ?? 0;
    x = times.map((t) => t - base);
  } else if (xaxis === 'time' && times) {
    x = times;
  } else if (xaxis === 'evals' && evals) {
    x = evals;
  } else {
    x = y.map((_, i) => i);
  }
  const n = Math.min(x.length, y.length);
  const pts = [];
  const warmupBase =
    xaxis === 'time_rel' && times ? (times[Math.min(2, times.length - 1)] ?? 0) : 0;
  for (let i = 0; i < n; i++) {
    const yi = y[i];
    if (yi === null || yi === undefined || Number.isNaN(yi)) continue;
    pts.push({
      x: x[i],
      y: yi,
      // full per-point metadata so tooltips can show all dimensions
      _meta: {
        iter: i,
        time: times ? times[i] : undefined,
        time_rel: times ? times[i] - warmupBase : undefined,
        evals: evals ? evals[i] : undefined,
        loss: yi,
      },
    });
  }
  return pts;
}

function renderChart() {
  const ctx = $('chart').getContext('2d');
  const xaxis = $('xaxis').value;
  const logY = $('logY').checked;

  const datasets = [];
  for (const id of state.selected) {
    const s = state.series.find((x) => x.id === id);
    const run = state.loaded.get(id);
    const pts = buildDataForRun(run, xaxis);
    datasets.push({
      label: s ? s.runName : id,
      data: pts,
      borderColor: colorFor(id),
      backgroundColor: colorFor(id),
      pointRadius: 0,
      borderWidth: 1.6,
      tension: 0,
    });
  }

  const xTitle =
    xaxis === 'time_rel'
      ? 'wall time − warmup (s)'
      : xaxis === 'time'
        ? 'wall time (s)'
        : xaxis === 'evals'
          ? 'eval count'
          : 'iteration';

  const config = {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { labels: { color: '#d6dae0', boxWidth: 12 } },
        tooltip: {
          callbacks: {
            title: (items) => (items.length ? items[0].dataset.label : ''),
            label: (c) => {
              const m = c.raw && c.raw._meta ? c.raw._meta : {};
              const parts = [];
              parts.push(`loss: ${fmt(m.loss ?? c.parsed.y)}`);
              if (m.iter !== undefined) parts.push(`iter: ${fmt(m.iter, 0)}`);
              if (m.time !== undefined) parts.push(`time: ${fmt(m.time)}s`);
              if (m.time_rel !== undefined) parts.push(`time−warmup: ${fmt(m.time_rel)}s`);
              if (m.evals !== undefined) parts.push(`evals: ${fmt(m.evals, 0)}`);
              return parts;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: xTitle, color: '#8a94a0' },
          ticks: { color: '#8a94a0' },
          grid: { color: '#2c333d' },
        },
        y: {
          type: logY ? 'logarithmic' : 'linear',
          title: { display: true, text: 'loss', color: '#8a94a0' },
          ticks: { color: '#8a94a0' },
          grid: { color: '#2c333d' },
        },
      },
    },
  };

  if (state.chart) {
    state.chart.destroy();
  }
  state.chart = new Chart(ctx, config);
}

function renderSummary() {
  const table = $('summary');
  if (!state.selected.size) {
    table.innerHTML = '';
    return;
  }
  const cols = [
    ['name', 'run'],
    ['final_loss', 'final'],
    ['best_loss', 'best'],
    ['iters', 'iters'],
    ['train_acc', 'train'],
    ['test_acc', 'test'],
    ['wall', 'wall(s)'],
    ['ms_per_iter', 'ms/it'],
    ['iters_to_target', 'it→tgt'],
    ['reached', 'reached'],
  ];
  let html = '<thead><tr>' + cols.map(([, l]) => `<th>${l}</th>`).join('') + '</tr></thead><tbody>';
  for (const id of state.selected) {
    const s = state.series.find((x) => x.id === id);
    const run = state.loaded.get(id);
    const rowSrc = run ?? s?.summary ?? {};
    html += '<tr>';
    for (const [key] of cols) {
      let v = rowSrc[key];
      if (key === 'name') v = s?.runName ?? v;
      if (key === 'reached') v = v ? '✓' : '';
      html += `<td>${key === 'name' || key === 'reached' ? escapeHtml(v ?? '—') : fmt(v)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  table.innerHTML = html;
}

async function loadManifest() {
  setStatus('Loading manifest…');
  try {
    const res = await fetch(`manifest.json?ts=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    state.manifest = manifest;
    state.series = buildSeries(manifest);
    state.loaded.clear();
    state.selected.clear();
    populateActivations();
    const selNames = applyUrl();
    populateActivations();
    await reresolveSelection(selNames);
    renderList();
    renderChart();
    renderSummary();
    syncUrl();
    setStatus(
      `Loaded manifest: ${state.series.length} runs from ${manifest.count ?? 0} artifacts.`
    );
  } catch (err) {
    setStatus(
      `Failed to load manifest.json: ${err.message}. Run generate-results-manifest.js first.`
    );
  }
}

// Wire up controls.
$('clearSel').addEventListener('click', () => {
  state.selected.clear();
  renderList();
  renderChart();
  renderSummary();
  syncUrl();
});
$('metric').addEventListener('change', renderChart);
// Search only affects the visible list, not the resolved selection.
$('search').addEventListener('input', () => {
  renderList();
  syncUrl();
});
// When a disambiguating filter changes, re-resolve the current selection
// by name against the new filtered list so equivalent plots stay linked.
async function onFilterChange() {
  const names = [...state.selected]
    .map((id) => state.series.find((s) => s.id === id)?.runName)
    .filter(Boolean);
  await reresolveSelection(names);
  renderList();
  renderChart();
  renderSummary();
  syncUrl();
}

$('filterActivation').addEventListener('change', onFilterChange);
$('xaxis').addEventListener('change', () => {
  renderChart();
  syncUrl();
});
$('logY').addEventListener('change', () => {
  renderChart();
  syncUrl();
});
$('theme').addEventListener('change', () => {
  setTheme($('theme').value);
  renderChart(); // re-render so chart colors match if desired
  syncUrl();
});

loadManifest();
