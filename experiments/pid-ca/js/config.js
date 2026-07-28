/**
 * config.js — single source of truth for the PID-CA configuration surface (§5, §7.1).
 *
 * Responsibilities:
 *  - declare the parameter schema (type, range, default, grouping, visibility)
 *  - validate / coerce arbitrary input into a well-formed configuration
 *  - serialise to and from plain JSON-compatible objects (presets, share links)
 *  - notify subscribers when parameters change
 */

export const BOUNDARIES = ['toroidal', 'fixed', 'reflective'];
export const NEIGHBORHOODS = ['moore', 'vonNeumann'];
export const EXPRESSIONS = ['threshold', 'quantize', 'semantic', 'probabilistic'];
export const ACTIVE_PREDICATES = ['gt0', 'ge2', 'eqMax'];
export const INITIAL_CONDITIONS = ['random', 'center', 'singleCell', 'stripes', 'empty'];
export const TARGET_MODES = ['constant', 'gradientX', 'radial', 'oscillating'];
export const OVERLAYS = ['none', 'u', 'integral', 'error'];

export const GROUPS = [
  'Grid & topology',
  'Target',
  'PID gains',
  'State expression',
  'Initialisation',
  'Playback',
  'Display',
];

const isExpr =
  (...names) =>
  (cfg) =>
    names.includes(cfg.expression);

/** Full parameter schema. `structural: true` means a change forces reallocation + reset. */
export const SCHEMA = {
  // ---------------------------------------------------------------- topology
  gridWidth: {
    group: 'Grid & topology',
    label: 'Grid width',
    type: 'int',
    min: 8,
    max: 400,
    step: 1,
    default: 120,
    structural: true,
  },
  gridHeight: {
    group: 'Grid & topology',
    label: 'Grid height',
    type: 'int',
    min: 8,
    max: 400,
    step: 1,
    default: 80,
    structural: true,
  },
  boundary: {
    group: 'Grid & topology',
    label: 'Boundary condition',
    type: 'enum',
    options: BOUNDARIES,
    default: 'toroidal',
    optionLabels: {
      toroidal: 'Toroidal (wrap)',
      fixed: 'Fixed (dead border)',
      reflective: 'Reflective',
    },
  },
  neighborhood: {
    group: 'Grid & topology',
    label: 'Neighbourhood',
    type: 'enum',
    options: NEIGHBORHOODS,
    default: 'moore',
    optionLabels: { moore: 'Moore', vonNeumann: 'von Neumann' },
  },
  radius: {
    group: 'Grid & topology',
    label: 'Neighbourhood radius',
    type: 'int',
    min: 1,
    max: 6,
    step: 1,
    default: 1,
  },
  activePredicate: {
    group: 'Grid & topology',
    label: '"Active" predicate',
    type: 'enum',
    options: ACTIVE_PREDICATES,
    default: 'gt0',
    optionLabels: { gt0: 'state > 0', ge2: 'state >= 2', eqMax: 'state = max' },
    hint: 'Definition of "active" used when counting N_t(c).',
  },

  // ------------------------------------------------------------------ target
  targetMode: {
    group: 'Target',
    label: 'Target mode',
    type: 'enum',
    options: TARGET_MODES,
    default: 'constant',
    optionLabels: {
      constant: 'Constant T',
      gradientX: 'Horizontal gradient',
      radial: 'Radial field',
      oscillating: 'Time-oscillating',
    },
  },
  target: {
    group: 'Target',
    label: 'Target T (active neighbours)',
    type: 'float',
    min: 0,
    max: 24,
    step: 0.05,
    default: 4,
  },
  targetAmplitude: {
    group: 'Target',
    label: 'Target amplitude',
    type: 'float',
    min: -8,
    max: 8,
    step: 0.05,
    default: 2,
    visible: (cfg) => cfg.targetMode !== 'constant',
  },
  targetPeriod: {
    group: 'Target',
    label: 'Target period (steps)',
    type: 'int',
    min: 2,
    max: 2000,
    step: 1,
    default: 160,
    visible: (cfg) => cfg.targetMode === 'oscillating',
  },

  // --------------------------------------------------------------- pid gains
  kp: {
    group: 'PID gains',
    label: 'Kp (proportional)',
    type: 'float',
    min: -4,
    max: 4,
    step: 0.01,
    default: 1,
  },
  ki: {
    group: 'PID gains',
    label: 'Ki (integral)',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.002,
    default: 0.02,
  },
  kd: {
    group: 'PID gains',
    label: 'Kd (derivative)',
    type: 'float',
    min: -4,
    max: 4,
    step: 0.01,
    default: 0.4,
  },
  integralClamp: {
    group: 'PID gains',
    label: 'Clamp integral (anti-windup)',
    type: 'bool',
    default: true,
  },
  integralMin: {
    group: 'PID gains',
    label: 'Integral min',
    type: 'float',
    min: -50,
    max: 0,
    step: 0.5,
    default: -8,
    visible: (cfg) => cfg.integralClamp,
  },
  integralMax: {
    group: 'PID gains',
    label: 'Integral max',
    type: 'float',
    min: 0,
    max: 50,
    step: 0.5,
    default: 8,
    visible: (cfg) => cfg.integralClamp,
  },

  // -------------------------------------------------------- state expression
  stateCardinality: {
    group: 'State expression',
    label: 'State cardinality',
    type: 'enum',
    options: [2, 3],
    default: 2,
    optionLabels: { 2: '2-state {0,1}', 3: '3-state {0,1,2}' },
  },
  expression: {
    group: 'State expression',
    label: 'Expression function',
    type: 'enum',
    options: EXPRESSIONS,
    default: 'threshold',
    optionLabels: {
      threshold: 'Binary threshold',
      quantize: 'Ternary quantisation',
      semantic: 'Ternary semantic (dominant term)',
      probabilistic: 'Probabilistic (sigmoid)',
    },
  },
  theta: {
    group: 'State expression',
    label: 'Threshold θ',
    type: 'float',
    min: -10,
    max: 10,
    step: 0.05,
    default: 0,
    visible: isExpr('threshold', 'semantic', 'probabilistic'),
  },
  bandA: {
    group: 'State expression',
    label: 'Band edge a',
    type: 'float',
    min: -10,
    max: 10,
    step: 0.05,
    default: -0.5,
    visible: isExpr('quantize'),
  },
  bandB: {
    group: 'State expression',
    label: 'Band edge b',
    type: 'float',
    min: -10,
    max: 10,
    step: 0.05,
    default: 0.5,
    visible: isExpr('quantize'),
    hint: 'Requires a < b.',
  },
  sigmoidScale: {
    group: 'State expression',
    label: 'Sigmoid steepness',
    type: 'float',
    min: 0.1,
    max: 10,
    step: 0.1,
    default: 1,
    visible: isExpr('probabilistic'),
  },

  // -------------------------------------------------------- initial condition
  initialCondition: {
    group: 'Initialisation',
    label: 'Initial condition',
    type: 'enum',
    options: INITIAL_CONDITIONS,
    default: 'random',
    optionLabels: {
      random: 'Uniform random density',
      center: 'Central block',
      singleCell: 'Single seed cell',
      stripes: 'Vertical stripes',
      empty: 'Empty grid',
    },
  },
  initialDensity: {
    group: 'Initialisation',
    label: 'Random density',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    visible: (cfg) => cfg.initialCondition === 'random' || cfg.initialCondition === 'center',
  },
  seed: {
    group: 'Initialisation',
    label: 'RNG seed',
    type: 'int',
    min: 0,
    max: 999999,
    step: 1,
    default: 1234,
    hint: 'Deterministic: same seed + config = same run.',
  },

  // ---------------------------------------------------------------- playback
  stepsPerSecond: {
    group: 'Playback',
    label: 'Steps per second',
    type: 'float',
    min: 0.5,
    max: 240,
    step: 0.5,
    default: 20,
  },
  maxStepsPerFrame: {
    group: 'Playback',
    label: 'Max steps per frame',
    type: 'int',
    min: 1,
    max: 60,
    step: 1,
    default: 8,
    hint: 'Caps catch-up work when the tick rate exceeds the refresh rate.',
  },

  // ----------------------------------------------------------------- display
  cellSize: {
    group: 'Display',
    label: 'Cell size (px)',
    type: 'int',
    min: 1,
    max: 24,
    step: 1,
    default: 6,
  },
  overlay: {
    group: 'Display',
    label: 'Diagnostic overlay',
    type: 'enum',
    options: OVERLAYS,
    default: 'none',
    optionLabels: {
      none: 'None (states only)',
      u: 'Control output u_t',
      integral: 'Integral I_t (frustration)',
      error: 'Error e_t',
    },
  },
  overlayScale: {
    group: 'Display',
    label: 'Overlay scale (± range)',
    type: 'float',
    min: 0.5,
    max: 40,
    step: 0.5,
    default: 8,
    visible: (cfg) => cfg.overlay !== 'none',
  },
  showGridLines: {
    group: 'Display',
    label: 'Grid lines',
    type: 'bool',
    default: false,
  },
};

export const CONFIG_KEYS = Object.keys(SCHEMA);

/** @returns {object} a fresh configuration containing every schema default. */
export function defaultConfig() {
  const cfg = {};
  for (const key of CONFIG_KEYS) cfg[key] = SCHEMA[key].default;
  return cfg;
}

function clamp(v, lo, hi) {
  if (typeof lo === 'number' && v < lo) return lo;
  if (typeof hi === 'number' && v > hi) return hi;
  return v;
}

/**
 * Coerce + validate an arbitrary object into a complete configuration.
 * Unknown keys are ignored; invalid values fall back to defaults.
 * @returns {{config: object, errors: string[]}}
 */
export function validateConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const config = defaultConfig();
  const errors = [];

  for (const key of CONFIG_KEYS) {
    if (!(key in source)) continue;
    const spec = SCHEMA[key];
    let value = source[key];
    if (value === undefined || value === null || value === '') continue;

    switch (spec.type) {
      case 'int': {
        const n = Math.round(Number(value));
        if (!Number.isFinite(n)) {
          errors.push(key + ': not a number');
          break;
        }
        config[key] = clamp(n, spec.min, spec.max);
        break;
      }
      case 'float': {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          errors.push(key + ': not a number');
          break;
        }
        config[key] = clamp(n, spec.min, spec.max);
        break;
      }
      case 'bool':
        config[key] = value === 'false' ? false : Boolean(value);
        break;
      case 'enum': {
        const match = spec.options.find((o) => o === value || String(o) === String(value));
        if (match === undefined) {
          errors.push(key + ': "' + value + '" is not a valid option');
          break;
        }
        config[key] = match;
        break;
      }
      default:
        config[key] = value;
    }
  }

  // ---- cross-field invariants -------------------------------------------
  if (config.bandA >= config.bandB) {
    config.bandB = config.bandA + Math.max(0.05, Math.abs(config.bandA) * 0.05);
    errors.push('band edges must satisfy a < b; adjusted b');
  }
  if (config.integralMin >= config.integralMax) {
    config.integralMin = -Math.abs(config.integralMax) - 1;
    errors.push('integral clamp must satisfy min < max; adjusted min');
  }
  if (config.stateCardinality === 2 && config.expression === 'semantic') {
    errors.push('semantic mapping is intended for 3-state mode; states will be clamped to {0,1}');
  }

  return { config, errors };
}

/** Target field T(c, t) — §3.2 / §5 (global scalar, spatial field, or time-varying). */
export function targetAt(cfg, x, y, t) {
  switch (cfg.targetMode) {
    case 'gradientX': {
      const w = Math.max(1, cfg.gridWidth - 1);
      return cfg.target + cfg.targetAmplitude * ((x / w) * 2 - 1);
    }
    case 'radial': {
      const cx = (cfg.gridWidth - 1) / 2;
      const cy = (cfg.gridHeight - 1) / 2;
      const norm = Math.hypot(cx, cy) || 1;
      const r = Math.hypot(x - cx, y - cy) / norm;
      return cfg.target + cfg.targetAmplitude * (1 - 2 * r);
    }
    case 'oscillating':
      return (
        cfg.target +
        cfg.targetAmplitude * Math.sin((2 * Math.PI * t) / Math.max(2, cfg.targetPeriod))
      );
    case 'constant':
    default:
      return cfg.target;
  }
}

/** True when T does not vary across space (allows a fast path in simulation.js). */
export function isTargetSpatiallyUniform(cfg) {
  return cfg.targetMode === 'constant' || cfg.targetMode === 'oscillating';
}

/** Only the keys that differ from defaults — keeps share links / presets small. */
export function diffFromDefaults(cfg) {
  const defaults = defaultConfig();
  const out = {};
  for (const key of CONFIG_KEYS) {
    if (cfg[key] !== defaults[key]) out[key] = cfg[key];
  }
  return out;
}

export function toHashString(cfg) {
  return 'cfg=' + encodeURIComponent(JSON.stringify(diffFromDefaults(cfg)));
}

export function fromHashString(hash) {
  try {
    const raw = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('cfg');
    if (!raw) return {};
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('config: could not parse URL hash', err);
    return {};
  }
}

/**
 * Observable configuration container.
 * Subscribers receive (changedKeys: string[], config: object).
 */
export class Config {
  constructor(initial = {}) {
    const { config, errors } = validateConfig({ ...defaultConfig(), ...initial });
    this._values = config;
    this.errors = errors;
    this._subscribers = new Set();
  }

  /** Read-only snapshot (do not mutate). */
  all() {
    return this._values;
  }

  get(key) {
    return this._values[key];
  }

  set(key, value) {
    if (!(key in SCHEMA)) return [];
    return this.patch({ [key]: value });
  }

  patch(partial) {
    const { config, errors } = validateConfig({ ...this._values, ...partial });
    const changed = this._diff(config);
    this.errors = errors;
    if (!changed.length) return changed;
    this._values = config;
    this._emit(changed);
    return changed;
  }

  /** Replace the whole configuration (missing keys revert to defaults). */
  loadJSON(obj) {
    const { config, errors } = validateConfig(obj);
    const changed = this._diff(config);
    this._values = config;
    this.errors = errors;
    if (changed.length) this._emit(changed);
    return errors;
  }

  toJSON() {
    return { ...this._values };
  }

  subscribe(fn) {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  _diff(next) {
    return CONFIG_KEYS.filter((k) => next[k] !== this._values[k]);
  }

  _emit(changed) {
    for (const fn of [...this._subscribers]) {
      try {
        fn(changed, this._values);
      } catch (err) {
        console.error('config subscriber failed', err);
      }
    }
  }
}
