// Physics parameters (physics.md §A.11) plus implementation knobs.

export const DEFAULTS = Object.freeze({
  // resolution / time
  h: 2.0, ng: 2, dt: 1 / 60,
  // gravity
  G: 6.674e-11, Gmult: 1,
  Ngrid: 2000, Smax: 4, epsM: 0.005, marginCells: 2, gravityWorkQuantum: 4096,
  gradientOrder: 2,          // 2 | 4   (B.10 Q2: configurable)
  greenFunction: 'point',    // 'point' | 'integrated'
  directSelfMax: 2000, directNearMax: 200000, farFactor: 4,
  // frame
  Omega: null,               // null → primary spin; or [x,y,z] rad/s
  uRebase: 1e-3, tRebase: 600, tumbleTol: 1e-3,
  // friction / faces
  kappaMu: 0.8, vStick: 1e-3, tStick: 2, kappaHeal: 0.1, tHeal: 3600, coldWeld: false,
  Nbreak: 256,
  // contacts
  Kc: 8, e: 0.2, vBounce: 5e-3, beta: 0.2, slopFrac: 0.01, vPush: 5e-3, sepFrac: 0.05,
  // stress
  Ks: 40, Ku: 2, stressTol: 1e-3, epsSigma: 1e-3, stressEvery: 30, alphaActive: 1e-7, fatigueOnset: 0.6,
  // thermal
  Nth: 4, dTmin: 1e-6, Tref: 0, T0: 200, sun: true, S0: 1361, rAU: 1, sunDir: [1, 0, 0],
  sigmaSB: 5.670374419e-8, kSub: 1e-4, vJet: 300, Lsub: 2.8e6, Tsinter: 1400, tSinter: 60,
  // particles
  escapeBound: 20000, particleCap: 20000, depositFrac: 0.3, particleRestitution: 0.2,
  // pools
  vcap: 65536, fcap: 262144,
});

export function makeParams(overrides = {}) {
  const p = { ...DEFAULTS, ...overrides };
  const pos = ['h', 'dt', 'vcap', 'fcap', 'Kc', 'Ks', 'Nth', 'stressEvery', 'gravityWorkQuantum'];
  for (const k of pos) if (!(p[k] > 0)) throw new Error(`param ${k} must be > 0`);
  if (!Number.isInteger(p.ng) || p.ng < 1) throw new Error('ng must be a positive integer');
  if (p.gradientOrder !== 2 && p.gradientOrder !== 4) throw new Error('gradientOrder must be 2 or 4');
  if (p.greenFunction !== 'point' && p.greenFunction !== 'integrated') throw new Error('greenFunction must be point|integrated');
  if (p.Omega !== null && (!Array.isArray(p.Omega) && !(p.Omega instanceof Float64Array))) throw new Error('Omega must be null or [x,y,z]');
  if (p.vcap > 1 << 22) throw new Error('vcap too large');
  p.sunDir = [p.sunDir[0], p.sunDir[1], p.sunDir[2]];
  p.Geff = p.G * p.Gmult;
  return p;
}