// UI entry point (problem.md §6.6). Builds the side panel, runs the pipeline on every change
// (debounced, preview quality), renders the validator report, drives the viewer and exports.

import {
  defaultSpec, normaliseSpec, makeChannel, CHANNEL_PRESETS, SECTIONS, BIASES, PORE_MODES, PROCESSES, FRAME_MODES, suggestedPitch,
} from './spec.js';
import { GENERATORS } from './generators/index.js';
import { runPipeline, allMeshes, bundle } from './pipeline.js';
import { QUALITY } from './mesh.js';
import { Viewer } from './viewer.js';
import { toBinarySTL, download, preflight } from './stl.js';

const $panel = document.getElementById('panel');
const $hud = document.getElementById('hud');
const viewer = new Viewer(document.getElementById('view'));

let spec = defaultSpec();
let result = null, error = null, selected = null, firstRun = true, timer = null;
const hidden = new Set();
const view = {
  xray: false, clip: 1, showPlate: true, showFrame: true,
  overlays: { clearance: true, bend: false, overhang: true, drain: false, roots: false, box: true },
};
let $channels, $report, $preflight;

// ------------------------------------------------------------------ DOM helpers
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

function num(label, obj, key, o = {}) {
  const input = el('input', { type: 'number', min: o.min, max: o.max, step: o.step ?? 'any', value: obj[key], title: o.title });
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) { input.value = obj[key]; return; }
    obj[key] = v; (o.after || schedule)();
  });
  return el('label', { class: 'f' }, el('span', { text: label }), input);
}
function range(label, obj, key, min, max, step, after) {
  const out = el('span', { text: obj[key] });
  const input = el('input', { type: 'range', min, max, step, value: obj[key] });
  input.addEventListener('input', () => { obj[key] = parseFloat(input.value); out.textContent = input.value; (after || schedule)(); });
  return el('label', { class: 'f' }, el('span', {}, `${label} `, out), input);
}
function sel(label, obj, key, options, after) {
  const s = el('select', {}, ...options.map((v) => el('option', { value: typeof v === 'string' ? v : v.value, text: typeof v === 'string' ? v : v.label })));
  s.value = obj[key];
  s.addEventListener('change', () => { obj[key] = s.value; (after || schedule)(); });
  return el('label', { class: 'f' }, el('span', { text: label }), s);
}
function chk(label, obj, key, after) {
  const i = el('input', { type: 'checkbox', checked: !!obj[key] });
  i.addEventListener('change', () => { obj[key] = i.checked; (after || schedule)(); });
  return el('label', { class: 'chk' }, i, label);
}
function text(label, obj, key, after) {
  const i = el('input', { type: 'text', value: obj[key] });
  i.addEventListener('change', () => { obj[key] = i.value; (after || schedule)(); });
  return el('label', { class: 'f' }, el('span', { text: label }), i);
}
function section(title, open, body) {
  return el('details', { open }, el('summary', { text: title }), body);
}

// ------------------------------------------------------------------ panel
function buildPanel() {
  $panel.replaceChildren();
  const genOpts = Object.entries(GENERATORS).map(([value, g]) => ({ value, label: g.label }));
  const seedBtn = el('button', { text: '🎲', title: 'random seed', onclick: () => { spec.seed = `ptrs-${Math.random().toString(36).slice(2, 8)}`; buildPanel(); schedule(0); } });

  $panel.append(
    el('h1', { text: 'PTRS Lattice Generator' }),
    el('div', { class: 'body' },
      sel('generator', spec, 'generator', genOpts),
      el('div', { class: 'row', style: 'align-items:flex-end' }, text('seed', spec, 'seed'), seedBtn),
      el('div', { class: 'row span2' },
        el('button', { class: 'primary', text: 'Regenerate', onclick: () => schedule(0) }),
        el('span', { class: 'muted', text: 'changes regenerate automatically (preview quality)' })),
    ),
  );

  const pitchBtn = el('button', { text: 'suggest', title: 'pitch = Ø_max + clearance + 0.5', onclick: () => { spec.grid.pitch = suggestedPitch(spec); buildPanel(); schedule(0); } });
  $panel.append(section('Cartridge & lattice', true, el('div', { class: 'body' },
    num('X mm', spec.cartridge.dims, 'x', { min: 20, step: 5 }),
    num('Y mm', spec.cartridge.dims, 'y', { min: 20, step: 5 }),
    num('Z mm', spec.cartridge.dims, 'z', { min: 20, step: 5 }),
    el('div', { class: 'row', style: 'align-items:flex-end' }, num('pitch mm', spec.grid, 'pitch', { min: 2, step: 0.5, title: 'grid cell size; ≥ Ø_max + clearance' }), pitchBtn),
    num('clearance mm', spec, 'clearanceMin', { min: 0.5, step: 0.5, title: 'min tube‑to‑tube gap (roots must fit)' }),
    num('fill (maze)', spec, 'fill', { min: 0.1, max: 0.95, step: 0.05, title: 'fraction of grid cells claimed by tubes' }),
    range('organic', spec, 'organic', 0, 1, 0.05),
    num('smoothing', spec, 'smoothing', { min: 0, max: 4, step: 1, title: 'Chaikin iterations' }),
    num('bend factor', spec, 'bendRadiusFactor', { min: 0.5, max: 4, step: 0.25, title: 'min bend radius = factor × Ø (reported)' }),
    sel('frame', spec, 'frame', FRAME_MODES),
    num('plate mm', spec.plate, 'thickness', { min: 1, step: 0.5 }),
    num('barb mm', spec.plate, 'barb', { min: 0, step: 1, title: 'port stub length below the plate' }),
    num('margin mm', spec.plate, 'margin', { min: 0, step: 1 }),
  )));

  $panel.append(section('Printer', false, el('div', { class: 'body' },
    sel('process', spec.printer, 'process', PROCESSES),
    num('nozzle mm', spec.printer, 'nozzle', { min: 0.1, step: 0.05 }),
    num('min wall mm', spec.printer, 'minWall', { min: 0.2, step: 0.1 }),
    num('max overhang °', spec.printer, 'maxOverhangDeg', { min: 0, max: 90, step: 5 }),
    num('max bridge mm', spec.printer, 'maxBridge', { min: 0, step: 1 }),
    num('min feature mm', spec.printer, 'minFeature', { min: 0.1, step: 0.1 }),
    num('bed X', spec.printer.bed, 'x', { min: 50, step: 10 }),
    num('bed Y', spec.printer.bed, 'y', { min: 50, step: 10 }),
    num('bed Z', spec.printer.bed, 'z', { min: 50, step: 10 }),
  )));

  const presetSel = el('select', {}, ...Object.keys(CHANNEL_PRESETS).map((k) => el('option', { value: k, text: k })));
  $channels = el('div');
  $panel.append(section('Channels', true, el('div', { class: 'body one' },
    el('div', { class: 'row' }, presetSel, el('button', { text: '+ add channel', onclick: () => {
      let n = 0; while (spec.channels.some((c) => c.id === `ch${n}`)) n++;
      spec.channels.push(makeChannel(presetSel.value, `ch${n}`));
      renderChannels(); schedule(0);
    } })),
    $channels,
  )));
  renderChannels();

  $report = el('div');
  $panel.append(section('Report', true, el('div', { class: 'body one' }, $report)));

  $panel.append(section('View', true, el('div', { class: 'body' },
    chk('x‑ray', view, 'xray', () => viewer.setXray(view.xray)),
    range('clip Z', view, 'clip', 0, 1, 0.01, applyClip),
    chk('plate', view, 'showPlate', () => viewer.setPartVisible('plate', view.showPlate)),
    chk('frame', view, 'showFrame', () => viewer.setPartVisible('frame', view.showFrame)),
    el('div', { class: 'span2 muted', text: 'overlays' }),
    chk('clearance violations (red)', view.overlays, 'clearance', () => viewer.setOverlay('clearance', view.overlays.clearance)),
    chk('tight bends (pink)', view.overlays, 'bend', () => viewer.setOverlay('bend', view.overlays.bend)),
    chk('overhang runs (orange)', view.overlays, 'overhang', () => viewer.setOverlay('overhang', view.overlays.overhang)),
    chk('drain minima (blue)', view.overlays, 'drain', () => viewer.setOverlay('drain', view.overlays.drain)),
    chk('root‑unreachable fog', view.overlays, 'roots', () => viewer.setOverlay('roots', view.overlays.roots)),
    chk('cartridge box', view.overlays, 'box', () => viewer.setOverlay('box', view.overlays.box)),
    el('button', { class: 'span2', text: 'fit view', onclick: () => result && viewer.fit(result.report.bbox) }),
  )));

  $preflight = el('ul', { class: 'pf' });
  const fileIn = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      spec = normaliseSpec(json.spec || json);
      hidden.clear(); selected = null; firstRun = true;
      buildPanel(); schedule(0);
    } catch (e) { error = e; renderReport(); }
    fileIn.value = '';
  });
  $panel.append(section('Export', true, el('div', { class: 'body one' },
    el('div', { class: 'row' },
      el('button', { class: 'primary', text: 'STL (one solid)', onclick: () => doExport('stl') }),
      el('button', { text: 'STL per channel', onclick: () => doExport('stl-split') }),
      el('button', { text: 'glTF (.glb)', onclick: () => doExport('glb') }),
      el('button', { text: 'JSON spec + centrelines', onclick: () => doExport('json') }),
      el('button', { text: 'load JSON…', onclick: () => fileIn.click() }), fileIn),
    el('div', { class: 'muted', text: 'exports re‑mesh at print quality (finer rings, more segments) and run a pre‑flight check' }),
    $preflight,
  )));
}

function renderChannels() {
  $channels.replaceChildren(...spec.channels.map((ch) => channelCard(ch)));
}

function channelCard(ch) {
  const colour = el('input', { type: 'color', value: ch.colour });
  colour.addEventListener('input', () => { ch.colour = colour.value; viewer.setColour(ch.id, ch.colour); renderReport(); });
  const name = el('input', { type: 'text', value: ch.name });
  name.addEventListener('change', () => { ch.name = name.value; renderReport(); });
  const eye = el('button', { text: hidden.has(ch.id) ? '◌' : '◉', title: 'show / hide', onclick: () => {
    if (hidden.has(ch.id)) hidden.delete(ch.id); else hidden.add(ch.id);
    eye.textContent = hidden.has(ch.id) ? '◌' : '◉';
    viewer.setVisible(ch.id, !hidden.has(ch.id));
  } });
  const remove = el('button', { text: '✕', title: 'remove channel', onclick: () => {
    spec.channels = spec.channels.filter((c) => c !== ch);
    renderChannels(); schedule(0);
  } });
  return el('div', { class: 'channel' },
    el('div', { class: 'head' }, colour, name, el('span', { class: 'muted', text: ch.id }), eye, remove),
    el('div', { class: 'grid' },
      num('Ø mm', ch, 'diameter', { min: 1, max: 20, step: 0.5 }),
      num('wall mm', ch, 'wall', { min: 0.4, max: 4, step: 0.1 }),
      sel('section', ch, 'section', SECTIONS),
      num('pore µm', ch, 'poreSize', { min: 50, max: 2000, step: 50 }),
      num('pores/cm²', ch, 'poreDensity', { min: 0, max: 50, step: 0.5 }),
      sel('pore mode', ch, 'poreMode', PORE_MODES),
      num('vol share', ch, 'volumeFraction', { min: 0, max: 10, step: 0.1, title: 'relative share of tube volume' }),
      range('tortuosity', ch, 'tortuosity', 0, 1, 0.05),
      sel('bias', ch, 'bias', BIASES),
      num('flow mL/min', ch, 'flowRate', { min: 0, step: 0.1 }),
      num('viscosity ×H₂O', ch, 'viscosity', { min: 0.5, step: 0.5 }),
      chk('dead‑end ok', ch, 'deadEndOk'),
    ),
  );
}

// ------------------------------------------------------------------ report
function renderReport() {
  if (!$report) return;
  $report.replaceChildren();
  if (error) { $report.append(el('pre', { class: 'err', text: String(error.message || error) })); return; }
  if (!result) { $report.append(el('div', { class: 'muted', text: 'generating…' })); return; }
  const r = result.report, pr = spec.printer;
  const line = (state, t) => el('div', { class: state === true ? 'ok' : state === false ? 'bad' : state === 'warn' ? 'warn' : 'muted', text: t });
  $report.append(
    line(r.clearanceOK, `clearance: min ${fmt(r.minClearance, 2)} mm (target ≥ ${spec.clearanceMin}) · ${r.clearanceViolationCount} violation(s)`),
    line(r.bendViolationCount === 0 ? true : 'warn', `bend radius: min ${fmt(r.minBendRadius)} mm · ${r.bendViolationCount} tighter than ${spec.bendRadiusFactor}×Ø (needs pitch ≥ ${(2 * spec.bendRadiusFactor).toFixed(1)}×Ø for grid corners)`),
    line(pr.process !== 'FDM' ? null : r.overhangRuns.length === 0 ? true : 'warn',
      pr.process !== 'FDM' ? `overhang: n/a for ${pr.process}` : `overhang: ${r.overhangRuns.length} run(s) steeper than ${pr.maxOverhangDeg}° and longer than ${pr.maxBridge} mm (${fmt(r.overhangLength, 0)} mm total)`),
    line(r.drainMinima.length === 0 ? true : 'warn', `drainability: ${r.drainMinima.length} trapped local minima (need drain pores or SLA/SLS)`),
    line(r.rootAccess.fraction >= 0.98, `root access: ${(r.rootAccess.fraction * 100).toFixed(1)} % of eroded void reachable from the top · void = ${(r.rootAccess.voidFraction * 100).toFixed(0)} % of cartridge`),
    line(r.bbox.fitsBed, `bounding box ${r.bbox.size.map((v) => v.toFixed(0)).join(' × ')} mm · bed ${pr.bed.x} × ${pr.bed.y} × ${pr.bed.z}`),
  );
  if (r.warnings.length) $report.append(el('ul', { class: 'warn' }, ...r.warnings.map((w) => el('li', { text: w }))));

  const heads = ['channel', 'cells', 'L mm', 'V mL', 'ΔP kPa', 'pores', 'clr mm', 'notes'];
  const tbody = el('tbody');
  for (const row of Object.values(r.channels)) {
    const tr = el('tr', { class: row.id === selected ? 'sel' : '', onclick: () => select(row.id === selected ? null : row.id) },
      el('td', {}, el('span', { class: 'swatch', style: `background:${row.colour}` }), row.name, row.deadEnd ? el('span', { class: 'warn', text: ' ⊣' }) : null),
      el('td', { class: 'num', text: row.cells == null ? '—' : row.cells }),
      el('td', { class: 'num', text: fmt(row.length, 0) }),
      el('td', { class: 'num', text: fmt(row.volume, 1) }),
      el('td', { class: 'num', text: fmt(row.deltaP, 2) }),
      el('td', { class: 'num', text: row.poresEst || '—' }),
      el('td', { class: `num ${row.minClearance < spec.clearanceMin - 1e-6 ? 'bad' : ''}`, text: fmt(row.minClearance, 2) }),
      el('td', { class: 'muted', text: [...row.notes, row.drainMinima ? `${row.drainMinima} minima` : '', row.overhangRuns ? `${row.overhangRuns} overhang runs` : ''].filter(Boolean).join('; ') }),
    );
    tbody.append(tr);
  }
  $report.append(el('table', {}, el('thead', {}, el('tr', {}, ...heads.map((h, i) => el('th', { class: i > 0 && i < 7 ? 'num' : '', text: h })))), tbody));
}

function renderPreflight(items) {
  if (!$preflight) return;
  $preflight.replaceChildren(...items.map((it) => el('li', { class: it.ok === true ? 'ok' : it.ok === false ? 'bad' : 'muted', text: it.msg })));
}

function select(id) {
  selected = id;
  viewer.highlight(id);
  renderReport();
}

// ------------------------------------------------------------------ pipeline glue
function hudText() {
  if (error) return `error: ${error.message || error}`;
  if (!result) return 'generating…';
  const r = result.report, s = r.stats || {};
  const cells = s.cellsTotal ? ` · ${s.cellsUsed}/${s.cellsTotal} cells` : '';
  return `${GENERATORS[spec.generator].label}${cells} · ${Math.round(r.triangles).toLocaleString()} tris · ${r.timingMs.toFixed(0)} ms · click a tube for its report row`;
}

function schedule(delay = 250) {
  clearTimeout(timer);
  timer = setTimeout(regenerate, delay);
}

function regenerate() {
  $hud.textContent = 'generating…';
  setTimeout(() => {
    try { result = runPipeline(spec, QUALITY.preview); error = null; }
    catch (e) { console.error(e); error = e; result = null; }
    refreshView();
    renderReport();
    $hud.textContent = hudText();
  }, 30);
}

function applyClip() {
  viewer.setClip(view.clip, -(spec.plate.thickness + spec.plate.barb), spec.cartridge.dims.z);
}

function refreshView() {
  if (!result) return;
  viewer.setModel(result.meshes);
  for (const id of hidden) viewer.setVisible(id, false);
  viewer.setPartVisible('plate', view.showPlate);
  viewer.setPartVisible('frame', view.showFrame);
  viewer.setXray(view.xray);
  viewer.setOverlays(result.report, view.overlays, spec);
  applyClip();
  viewer.highlight(selected);
  if (firstRun) { viewer.fit(result.report.bbox); firstRun = false; }
}

async function doExport(kind) {
  $hud.textContent = 'exporting at print quality…';
  await new Promise((r) => setTimeout(r, 30));
  try {
    const hi = runPipeline(spec, QUALITY.export);
    const parts = allMeshes(hi.meshes);
    renderPreflight(preflight(parts, spec, hi.report));
    const base = String(spec.seed).replace(/[^\w.-]+/g, '_') || 'ptrs';
    if (kind === 'stl') {
      download(toBinarySTL(parts), `${base}.stl`, 'model/stl');
    } else if (kind === 'stl-split') {
      for (const t of hi.meshes.tubes) download(toBinarySTL([t]), `${base}-${t.name}.stl`, 'model/stl');
      download(toBinarySTL([hi.meshes.plate, hi.meshes.frame].filter(Boolean)), `${base}-plate.stl`, 'model/stl');
    } else if (kind === 'glb') {
      viewer.setModel(hi.meshes);
      const buf = await viewer.exportGLB();
      download(buf, `${base}.glb`, 'model/gltf-binary');
      refreshView();
    } else if (kind === 'json') {
      download(JSON.stringify(bundle(hi)), `${base}.json`, 'application/json');
    }
  } catch (e) {
    console.error(e);
    renderPreflight([{ ok: false, msg: `export failed: ${e.message || e}` }]);
  }
  $hud.textContent = hudText();
}

// ------------------------------------------------------------------ picking
{
  const canvas = document.getElementById('view');
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) { down = null; return; }
    down = null;
    select(viewer.pick(e.clientX, e.clientY));
  });
}

buildPanel();
schedule(0);