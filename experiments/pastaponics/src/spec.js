// Spec data model (problem.md §6.1) + channel presets from idea.md §3.2.

export const CHANNEL_PRESETS = {
  N:       { name: 'N',       colour: '#3ddc84', diameter: 4, wall: 1.0, section: 'circle',  poreSize: 300, poreDensity: 4, flowRate: 2.0, viscosity: 1, bias: 'none' },
  P:       { name: 'P',       colour: '#ff8c2e', diameter: 4, wall: 1.0, section: 'circle',  poreSize: 300, poreDensity: 4, flowRate: 2.0, viscosity: 1, bias: 'none' },
  K:       { name: 'K',       colour: '#a56cf5', diameter: 4, wall: 1.0, section: 'circle',  poreSize: 300, poreDensity: 4, flowRate: 2.0, viscosity: 1, bias: 'none' },
  micro:   { name: 'micro',   colour: '#f06ac8', diameter: 3, wall: 0.9, section: 'ellipse', poreSize: 200, poreDensity: 6, flowRate: 0.5, viscosity: 1, bias: 'none' },
  bio:     { name: 'bio',     colour: '#b07a4b', diameter: 6, wall: 1.2, section: 'star',    poreSize: 600, poreDensity: 3, flowRate: 1.0, viscosity: 5, bias: 'core' },
  hormone: { name: 'hormone', colour: '#ffd93d', diameter: 3, wall: 0.9, section: 'circle',  poreSize: 150, poreDensity: 5, flowRate: 0.2, viscosity: 1, bias: 'periphery' },
  stress:  { name: 'stress',  colour: '#ff5a5a', diameter: 3, wall: 0.9, section: 'rsquare', poreSize: 200, poreDensity: 3, flowRate: 0.5, viscosity: 1, bias: 'bottom' },
  water:   { name: 'water',   colour: '#3aa0ff', diameter: 5, wall: 1.0, section: 'circle',  poreSize: 400, poreDensity: 6, flowRate: 5.0, viscosity: 1, bias: 'top' },
};

export const SECTIONS = ['circle', 'ellipse', 'rsquare', 'star'];
export const BIASES = ['none', 'top', 'bottom', 'core', 'periphery'];
export const PORE_MODES = ['explicit', 'material'];
export const PROCESSES = ['FDM', 'SLA', 'SLS'];
export const FRAME_MODES = ['none', 'posts', 'rim'];

export function makeChannel(presetKey, id, extra = {}) {
  const preset = CHANNEL_PRESETS[presetKey] || CHANNEL_PRESETS.water;
  return {
    id,
    preset: presetKey,
    ...preset,
    poreMode: 'explicit',      // explicit holes in the wall | material porosity (annotation only)
    volumeFraction: 1,         // relative share of the tube volume
    tortuosity: 0.7,           // 0 straight‑ish … 1 highly convoluted (maze persistence)
    deadEndOk: false,
    ...extra,
  };
}

export function defaultSpec() {
  return {
    seed: 'ptrs-001',
    generator: 'maze',
    cartridge: { shape: 'box', dims: { x: 100, y: 100, z: 80 }, manifoldFace: '-z' },
    grid: { pitch: 7.5 },
    clearanceMin: 2.5,
    bendRadiusFactor: 1.5,   // min bend radius = factor × Ø (problem.md §3.2) – reported, not enforced
    fill: 0.6,          // maze: fraction of grid cells claimed by tubes (rest is root space)
    organic: 0.2,       // node jitter amplitude (uses pitch slack; validator reports)
    smoothing: 2,       // Chaikin iterations
    printer: {
      process: 'FDM', nozzle: 0.4, minWall: 0.8, maxOverhangDeg: 45, maxBridge: 12, minFeature: 0.5,
      bed: { x: 220, y: 220, z: 250 },
    },
    plate: { thickness: 4, barb: 8, margin: 6 },
    frame: 'posts',     // none | posts | rim (problem.md §6.5)
    channels: ['N', 'P', 'K', 'water'].map((k, i) => makeChannel(k, `ch${i}`)),
  };
}
/** Merge a loaded JSON spec over the defaults so older / partial files still work. */
export function normaliseSpec(loaded) {
  const d = defaultSpec();
  const l = loaded || {};
  const s = { ...d, ...l };
  s.cartridge = { ...d.cartridge, ...(l.cartridge || {}), dims: { ...d.cartridge.dims, ...((l.cartridge || {}).dims || {}) } };
  s.grid = { ...d.grid, ...(l.grid || {}) };
  s.printer = { ...d.printer, ...(l.printer || {}), bed: { ...d.printer.bed, ...((l.printer || {}).bed || {}) } };
  s.plate = { ...d.plate, ...(l.plate || {}) };
  if (s.frame === true) s.frame = 'posts';
  if (s.frame === false || !FRAME_MODES.includes(s.frame)) s.frame = 'none';
  s.channels = (Array.isArray(l.channels) && l.channels.length ? l.channels : d.channels)
    .map((c, i) => makeChannel(c.preset || c.name, c.id || `ch${i}`, c));
  return s;
}


export function maxDiameter(spec) {
  return spec.channels.reduce((m, c) => Math.max(m, c.diameter), 0);
}

/** pitch ≥ Ø_max + c_min (problem.md §4.1); small extra slack for organic jitter */
export function suggestedPitch(spec) {
  return +(maxDiameter(spec) + spec.clearanceMin + 0.5).toFixed(1);
}

export function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setByPath(obj, path, value) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = value;
}