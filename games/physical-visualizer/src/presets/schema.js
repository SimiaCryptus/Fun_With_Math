/** Preset descriptor validation + defaults. Locked at Phase 3. */
export const DEFAULTS = {
  warp: { shader: 'warp/zoom-rotate.frag', decay: 0.96, zoom: 1, rotate: 1, drift: 1 },
  comp: { blend: 'add' },
  post: { bloom: 0, aberration: 0 },
  motion: { gravityScale: 1, shakeImpulse: 4 },
  requires: {},
};

const SAFE_PATH = /^(warp|comp|sim)\/[a-z0-9-]+\.frag$/;

/** Mutates `def` to fill defaults; returns an array of error strings (empty = valid). */
export function validate(def) {
  const errs = [];
  if (!def || typeof def !== 'object') return ['not an object'];
  if (!/^[a-z0-9-]{1,64}$/.test(def.id ?? '')) errs.push('id must be kebab-case');
  if (typeof def.name !== 'string' || !def.name) errs.push('name required');
  for (const k of Object.keys(DEFAULTS)) def[k] = { ...DEFAULTS[k], ...(def[k] ?? {}) };
  if (!SAFE_PATH.test(def.warp.shader)) errs.push(`warp.shader invalid: ${def.warp.shader}`);
  if (!SAFE_PATH.test(def.comp.shader ?? '')) errs.push(`comp.shader invalid: ${def.comp.shader}`);
  if (def.sim) {
    if (!SAFE_PATH.test(def.sim.shader ?? '')) errs.push(`sim.shader invalid: ${def.sim.shader}`);
    if (def.sim.texSize && (def.sim.texSize & (def.sim.texSize - 1))) errs.push('sim.texSize must be a power of two');
    def.requires.particles = true;
  }
  if (!['add', 'alpha'].includes(def.comp.blend)) errs.push('comp.blend must be add|alpha');
  if (typeof def.warp.decay !== 'number' || def.warp.decay < 0.5 || def.warp.decay > 0.999) errs.push('warp.decay out of range');
  def.params ??= [];
  if (!Array.isArray(def.params) || def.params.length > 4) errs.push('max 4 params');
  for (const p of def.params) {
    if (!p || typeof p.name !== 'string') errs.push('param.name required');
    if (p.bind != null && !/^[a-zA-Z_]\w*$/.test(p.bind)) errs.push(`param bind invalid: ${p.bind}`);
    p.default = typeof p.default === 'number' ? Math.min(1, Math.max(0, p.default)) : 0.5;
  }
  return errs;
}