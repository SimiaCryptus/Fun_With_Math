// @ts-check
import { createRng } from '../rng.js';
import * as V from '../vec3.js';
import { normalFromYawPitch } from '../portal.js';

export const EMITTER_MODES = ['fountain', 'rain', 'jet', 'shell'];

const COMMON = { rate: 10, max: 300, lifetime: 0 };

const DEFAULTS = {
  fountain: { center: [0, 3, 0], spread: [0.5, 0.1, 0.5], velocity: [0, 0, 0], velocityJitter: 0 },
  // Spawns on a square of half-size `size`, `height` above `center` along gravity "up".
  rain: { center: [0, 0, 0], height: 6, size: 5, speed: 0, velocityJitter: 0 },
  jet: { center: [0, 3, 0], yaw: 0, pitch: -90, speed: 4, cone: 5 },
  shell: { center: [0, 1.25, 0], radius: 2, speed: 0 },
};

const VEC_KEYS = ['center', 'spread', 'velocity'];

const vecSpec = (key, label, min, max) => ['x', 'y', 'z'].map((a) => ({ key: `${key}.${a}`, label: `${label} ${a}`, min, max, step: 0.05 }));

/** UI-agnostic parameter metadata (used by the HUD). */
export const EMITTER_PARAMS = {
  common: [
    { key: 'rate', label: 'rate /s', min: 0, max: 200, step: 1 },
    { key: 'max', label: 'max count', min: 10, max: 2000, step: 10 },
    { key: 'lifetime', label: 'lifetime s (0=∞)', min: 0, max: 20, step: 0.1 },
  ],
  fountain: [
    ...vecSpec('center', 'center', -6, 8),
    ...vecSpec('spread', 'spread', 0, 5),
    ...vecSpec('velocity', 'vel', -10, 10),
    { key: 'velocityJitter', label: 'vel jitter', min: 0, max: 5, step: 0.05 },
  ],
  rain: [
    ...vecSpec('center', 'center', -6, 8),
    { key: 'height', label: 'height', min: 0, max: 15, step: 0.1 },
    { key: 'size', label: 'half-size', min: 0.5, max: 15, step: 0.1 },
    { key: 'speed', label: 'down speed', min: 0, max: 10, step: 0.05 },
    { key: 'velocityJitter', label: 'vel jitter', min: 0, max: 3, step: 0.05 },
  ],
  jet: [
    ...vecSpec('center', 'center', -6, 8),
    { key: 'yaw', label: 'yaw°', min: -180, max: 180, step: 1 },
    { key: 'pitch', label: 'pitch°', min: -90, max: 90, step: 1 },
    { key: 'speed', label: 'speed', min: 0, max: 20, step: 0.1 },
    { key: 'cone', label: 'cone°', min: 0, max: 90, step: 0.5 },
  ],
  shell: [
    ...vecSpec('center', 'center', -6, 8),
    { key: 'radius', label: 'radius', min: 0.2, max: 8, step: 0.05 },
    { key: 'speed', label: 'radial speed', min: -10, max: 10, step: 0.05 },
  ],
};

function normalizeParams(p) {
  for (const k of VEC_KEYS) if (p[k] != null) p[k] = V.toVec3(p[k]);
  return p;
}

/** Orthonormal pair perpendicular to unit n. */
function basis(n) {
  const ref = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const a = V.normalize(V.cross(ref, n));
  return [a, V.cross(n, a)];
}

const jitterVec = (rng, j) => ({ x: j * rng.range(-1, 1), y: j * rng.range(-1, 1), z: j * rng.range(-1, 1) });

const SPAWN = {
  fountain(rng, P) {
    const c = P.center, s = P.spread, v = P.velocity, j = P.velocityJitter;
    const pos = { x: c.x + s.x * rng.range(-1, 1), y: c.y + s.y * rng.range(-1, 1), z: c.z + s.z * rng.range(-1, 1) };
    const vel = { x: v.x + j * rng.range(-1, 1), y: v.y + j * rng.range(-1, 1), z: v.z + j * rng.range(-1, 1) };
    return { pos, vel };
  },
  rain(rng, P, up) {
    const [a, b] = basis(up);
    let pos = V.addScaled(P.center, up, P.height);
    pos = V.addScaled(pos, a, P.size * rng.range(-1, 1));
    pos = V.addScaled(pos, b, P.size * rng.range(-1, 1));
    const vel = V.add(V.scale(up, -P.speed), jitterVec(rng, P.velocityJitter));
    return { pos, vel };
  },
  jet(rng, P) {
    const dir = normalFromYawPitch(P.yaw, P.pitch);
    const [a, b] = basis(dir);
    const cosMax = Math.cos((P.cone * Math.PI) / 180);
    const ct = 1 - rng.next() * (1 - cosMax);
    const st = Math.sqrt(Math.max(0, 1 - ct * ct));
    const ph = 2 * Math.PI * rng.next();
    let d = V.scale(dir, ct);
    d = V.addScaled(d, a, st * Math.cos(ph));
    d = V.addScaled(d, b, st * Math.sin(ph));
    return { pos: { ...P.center }, vel: V.scale(d, P.speed) };
  },
  shell(rng, P) {
    const z = 2 * rng.next() - 1;
    const ph = 2 * Math.PI * rng.next();
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const d = { x: r * Math.cos(ph), y: r * Math.sin(ph), z };
    return { pos: V.addScaled(P.center, d, P.radius), vel: V.scale(d, P.speed) };
  },
};

/**
 * Deterministic particle emitter, stepped with the world (same in browser & headless).
 * `params` is mutable: edits take effect on the next spawn; the RNG stream is kept.
 */
export function createEmitter(cfg = {}) {
  const rng = createRng(cfg.seed ?? 1);
  const mode0 = EMITTER_MODES.includes(cfg.mode) ? cfg.mode : 'fountain';
  const params = normalizeParams({ ...COMMON, ...structuredClone(DEFAULTS[mode0]), ...cfg, mode: mode0 });
  let carry = 0;

  function spawn(world) {
    if (world.particles.length >= params.max) return null;
    const { pos, vel } = SPAWN[params.mode](rng, params, world.background.up);
    const p = world.addParticle(pos, vel);
    if (params.lifetime > 0) p.expireStep = world.stepCount + Math.max(1, Math.round(params.lifetime / world.dt));
    return p;
  }

  return {
    config: cfg,
    params,
    get mode() { return params.mode; },
    get rate() { return params.rate; },
    set rate(r) { params.rate = r; },
    /** Switch mode; only fills parameters the new mode needs and that are missing. */
    setMode(mode) {
      if (!EMITTER_MODES.includes(mode)) throw new Error(`unknown emitter mode ${mode}`);
      const d = normalizeParams(structuredClone(DEFAULTS[mode]));
      for (const k of Object.keys(d)) if (params[k] == null) params[k] = d[k];
      params.mode = mode;
    },
    /** Spawn n particles immediately (still deterministic). */
    burst(world, n) { for (let i = 0; i < n; i++) spawn(world); },
    step(world) {
      carry += params.rate * world.dt;
      while (carry >= 1) {
        carry -= 1;
        spawn(world);
      }
    },
  };
}