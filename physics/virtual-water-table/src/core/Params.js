/**
 * @typedef {Object} CgParams
 * @property {number} H        slab aspect Lz/Ly, [0.01, 1.0]
 * @property {number} Re       Reynolds number on Ly, [200, 20000]
 * @property {'plug'|'parabolic'} inflow
 * @property {'periodic'|'freeslip'} spanwise
 * @property {'noslip'|'freeslip'} walls
 * @property {number} seed     uint32
 * @property {'auto'|'A'|'B'|'C'|'D'} tier
 * @property {boolean} twin    enable Lyapunov twin
 * @property {number} inkBudget solid-fraction cap
 * @property {number} perturb  inflow perturbation amplitude
 */
export const SCHEMA = {
  H:         { type: 'number', min: 0.01, max: 1.0, default: 0.2, step: 0.005, label: 'Slab aspect H = Lz/Ly' },
  Re:        { type: 'number', min: 200, max: 20000, default: 2000, step: 50, label: 'Reynolds number Re = U₀Ly/ν' },
  inflow:    { type: 'enum', values: ['plug', 'parabolic'], default: 'plug', label: 'Inflow profile p(z)' },
  spanwise:  { type: 'enum', values: ['periodic', 'freeslip'], default: 'periodic', label: 'Spanwise y± boundary' },
  walls:     { type: 'enum', values: ['noslip', 'freeslip'], default: 'noslip', label: 'Wall z± boundary' },
  seed:      { type: 'number', min: 0, max: 4294967295, default: 1337, step: 1, integer: true, label: 'Run seed' },
  tier:      { type: 'enum', values: ['auto', 'A', 'B', 'C', 'D'], default: 'auto', label: 'Quality tier' },
  twin:      { type: 'boolean', default: true, label: 'Lyapunov twin solver' },
  inkBudget: { type: 'number', min: 0.02, max: 0.5, default: 0.22, step: 0.01, label: 'Ink budget (solid fraction cap)' },
  perturb:   { type: 'number', min: 0, max: 0.1, default: 0.01, step: 0.001, label: 'Inflow perturbation amplitude' },
};
/** Short keys used by HashCodec to keep URL fragments compact. */
export const SHORT_KEYS = { H: 'H', Re: 'R', inflow: 'i', spanwise: 's', walls: 'w', seed: 'd', tier: 't', twin: 'T', inkBudget: 'b', perturb: 'p' };

export function defaults() { const d = {}; for (const k in SCHEMA) d[k] = SCHEMA[k].default; return d; }

/** @returns {{ok:boolean, errors:string[], normalized:CgParams}} */
export function validate(p = {}) {
  const errors = [], normalized = defaults();
  for (const [k, def] of Object.entries(SCHEMA)) {
    if (!(k in p) || p[k] == null) continue;
    let v = p[k];
    if (def.type === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) { errors.push(`${k}: not a number`); continue; }
      if (def.integer) v = Math.round(v);
      if (v < def.min || v > def.max) { errors.push(`${k}: ${v} clamped to [${def.min}, ${def.max}]`); v = Math.min(def.max, Math.max(def.min, v)); }
    } else if (def.type === 'enum') {
      if (!def.values.includes(v)) { errors.push(`${k}: invalid '${v}'`); v = def.default; }
    } else if (def.type === 'boolean') v = v === true || v === 'true' || v === 1;
    normalized[k] = v;
  }
  return { ok: errors.length === 0, errors, normalized };
}

/** Owns parameter state and emits 'params:change' {changed, params}. */
export class Params {
  constructor(bus, init = {}) { this.bus = bus; this._v = validate(init).normalized; }
  get(k) { return this._v[k]; }
  get all() { return { ...this._v }; }
  set(k, v, opts = {}) {
    let patch; if (typeof k === 'object') { patch = k; opts = v || {}; } else patch = { [k]: v };
    const { normalized } = validate({ ...this._v, ...patch });
    const changed = Object.keys(patch).filter((key) => normalized[key] !== this._v[key]);
    if (!changed.length) return false;
    this._v = normalized;
    if (!opts.silent) this.bus?.emit('params:change', { changed, params: this.all });
    return true;
  }
  toJSON() { return this.all; }
}