import { yawPitchFromNormal } from '../core/portal.js';
import { EMITTER_MODES, EMITTER_PARAMS } from '../core/sim/emitter.js';
const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
const setPath = (o, p, v) => {
   const ks = p.split('.');
   const last = ks.pop();
   ks.reduce((a, k) => a[k], o)[last] = v;
};

function el(tag, attrs = {}, parent = null) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (parent) parent.appendChild(e);
  return e;
}

export function createHud(root, app, handlers) {
  root.innerHTML = '';
  const section = (title) => { el('h3', { textContent: title }, root); return root; };

  const select = (label, options, value, onChange) => {
    const l = el('label', { textContent: label }, root);
    const s = el('select', {}, l);
    for (const o of options) el('option', { value: o, textContent: o }, s);
    s.value = value;
    s.onchange = () => onChange(s.value);
    return s;
  };
  const checkbox = (label, value, onChange) => {
    const l = el('label', { textContent: label }, root);
    const c = el('input', { type: 'checkbox', checked: value }, l);
    c.onchange = () => onChange(c.checked);
    return c;
  };
   const slider = (label, min, max, step, value, onInput, parent = root) => {
     const l = el('label', { textContent: label }, parent);
    const r = el('input', { type: 'range', min, max, step, value }, l);
    const v = el('span', { className: 'val', textContent: Number(value).toFixed(2) }, l);
    r.oninput = () => { v.textContent = Number(r.value).toFixed(2); onInput(Number(r.value)); };
    return { set(x) { r.value = x; v.textContent = Number(x).toFixed(2); }, get: () => Number(r.value) };
  };

  section('Scene');
  select('Preset', Object.keys(handlers.presets), app.presetName, handlers.onPreset);
   select('Field source (viz)', ['runtime', 'reference'], app.fieldSource, handlers.onFieldSource);

   section('Field terms');
   checkbox('Physical CF (tabulated)', app.terms.disks, (v) => handlers.onTerms({ disks: v }));
  checkbox('Gap (0-g) term', app.terms.gap, (v) => handlers.onTerms({ gap: v }));

  section('Visualization');
  checkbox('Arrow grid |E_CF|', app.viz.arrows, (v) => handlers.onViz({ arrows: v }));
  checkbox('Slice plane', app.viz.slice, (v) => handlers.onViz({ slice: v }));
  select('Slice shows', ['geff', 'ecf', 'phi'], app.viz.sliceMode, (v) => handlers.onViz({ sliceMode: v }));
  slider('Slice z offset', -3, 3, 0.05, app.viz.sliceOffset, (v) => handlers.onViz({ sliceOffset: v }));
  checkbox('Rim streamlines', app.viz.streams, (v) => handlers.onViz({ streams: v }));

  section('Portal');
  let current = null;
  const portalSelect = select('Portal', [], '', (id) => { current = id; refreshPortal(); });
  const cx = slider('center x', -6, 6, 0.05, 0, () => emitPortal());
  const cy = slider('center y', -2, 8, 0.05, 0, () => emitPortal());
  const cz = slider('center z', -6, 6, 0.05, 0, () => emitPortal());
  const yaw = slider('yaw°', -180, 180, 1, 0, () => emitPortal());
  const pitch = slider('pitch°', -90, 90, 1, 0, () => emitPortal());
  const radius = slider('radius', 0.2, 3, 0.05, 1, () => emitPortal());
  let portals = [];

  function findPortal() { return portals.find((p) => String(p.id) === String(current)); }
  function refreshPortal() {
    const p = findPortal();
    if (!p) return;
    const yp = yawPitchFromNormal(p.normal);
    cx.set(p.center.x); cy.set(p.center.y); cz.set(p.center.z);
    yaw.set(yp.yaw); pitch.set(yp.pitch); radius.set(p.radius);
  }
  function emitPortal() {
    const p = findPortal();
    if (!p) return;
    handlers.onPortalEdit(p.id, {
      center: { x: cx.get(), y: cy.get(), z: cz.get() },
      yaw: yaw.get(), pitch: pitch.get(), radius: radius.get(),
    });
  }

  section('Particles');
   const modeSel = select('Mode', EMITTER_MODES, 'fountain', (m) => handlers.onEmitterMode(m));
   const paramBox = el('div', {}, root);
  const row = el('div', {}, root);
   el('button', { textContent: 'Burst ×100', onclick: handlers.onBurst }, row);
  el('button', { textContent: 'Clear', onclick: handlers.onClear }, row);
  el('button', { textContent: 'Pause / Run', onclick: handlers.onTogglePause }, row);

  section('Stats');
  const stats = el('div', { id: 'stats' }, root);

  return {
    setPortals(list) {
      portals = list;
      portalSelect.innerHTML = '';
      for (const p of list) el('option', { value: String(p.id), textContent: `portal ${p.id} → ${p.linkId}` }, portalSelect);
      if (!findPortal()) current = list.length ? String(list[0].id) : null;
      portalSelect.value = current ?? '';
      refreshPortal();
    },
    setStats(text) { stats.textContent = text; },
     setEmitter(emitter) {
       modeSel.value = emitter.mode;
       paramBox.innerHTML = '';
       const specs = [...EMITTER_PARAMS.common, ...EMITTER_PARAMS[emitter.mode]];
       for (const s of specs) {
         slider(s.label, s.min, s.max, s.step, getPath(emitter.params, s.key),
           (v) => setPath(emitter.params, s.key, v), paramBox);
       }
     },
  };
}