/**
 * stateExpression.js — pluggable u_t -> discrete state mappings (§3.4, §7.4).
 *
 * Every strategy has the signature (u, p, i, d, cfg, rng) -> integer state.
 * Adding a new regime means adding one entry here; controller.js and grid.js
 * are untouched.
 */

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

export const STRATEGIES = {
  /** 1. Binary threshold mapping: state = 1 iff u_t > θ. */
  threshold: {
    label: 'Binary threshold',
    cardinality: 2,
    apply(u, p, i, d, cfg) {
      return u > cfg.theta ? 1 : 0;
    },
  },

  /** 2. Ternary quantisation: three bands of u_t split by a < b. */
  quantize: {
    label: 'Ternary quantisation',
    cardinality: 3,
    apply(u, p, i, d, cfg) {
      if (u < cfg.bandA) return 0;
      if (u < cfg.bandB) return 1;
      return 2;
    },
  },

  /**
   * 3. Ternary semantic mapping: which PID term dominates the output.
   *    0 = inactive, 1 = integral-dominant (stabilising / frustrated),
   *    2 = proportional- or derivative-dominant (actively driving).
   */
  semantic: {
    label: 'Ternary semantic (dominant term)',
    cardinality: 3,
    apply(u, p, i, d, cfg) {
      if (u <= cfg.theta) return 0;
      const ap = Math.abs(p);
      const ai = Math.abs(i);
      const ad = Math.abs(d);
      return ai >= ap && ai >= ad ? 1 : 2;
    },
  },

  /** 4. Probabilistic mapping: activation probability σ(scale·(u − θ)). */
  probabilistic: {
    label: 'Probabilistic (sigmoid)',
    cardinality: 2,
    apply(u, p, i, d, cfg, rng) {
      const pr = sigmoid(cfg.sigmoidScale * (u - cfg.theta));
      if (rng() >= pr) return 0;
      if (cfg.stateMax > 1 && rng() < pr) return cfg.stateMax;
      return 1;
    },
  },
  /**
   * 5. Signed saturating mapping: the sign of u_t (outside a |θ| dead-zone)
   *    selects the extreme of the configured signed range.
   */
  signed: {
    label: 'Signed saturating (min / 0 / max)',
    apply(u, p, i, d, cfg) {
      const dead = Math.abs(cfg.theta);
      if (u > dead) return cfg.stateMax;
      if (u < -dead) return cfg.stateMin;
      return 0;
    },
  },
  /**
   * 6. Signed level quantisation: u_t is mapped linearly onto the integer
   *    interval [stateMin, stateMax] (clamping is done by `expressState`).
   *    This is the general case of which threshold/quantise are special cases.
   */
  levels: {
    label: 'Signed levels (round gain·u)',
    apply(u, p, i, d, cfg) {
      return Math.round(cfg.levelGain * (u - cfg.theta));
    },
  },
  /**
   * 7. Bioelectrical mapping (bioelectrical.md §7): (V, gate) -> {0,1,2}.
   *    0 = polarized (CLOSED), 1 = firing (OPEN), 2 = refractory.
   *    Invoked through `expressBioelectrical`, which the membrane domain calls
   *    in place of `expressState` (the u_t argument list does not apply here).
   */
  bioelectrical: {
    label: 'Bioelectrical (V, gate)',
    cardinality: 3,
    apply(V, gate) {
      return gate === 1 ? 1 : gate === 2 ? 2 : 0;
    },
  },
};
/** Membrane display state (bioelectrical.md §7); gate: 0=CLOSED 1=OPEN 2=REFRACTORY. */
export function expressBioelectrical(V, gate) {
  return STRATEGIES.bioelectrical.apply(V, gate);
}

export function strategyNames() {
  return Object.keys(STRATEGIES);
}

/**
 * Map a control output (and its components) to the next discrete state,
 * clamped into the configured signed state range [stateMin, stateMax].
 */
export function expressState(name, u, p, i, d, cfg, rng) {
  const strategy = STRATEGIES[name] || STRATEGIES.threshold;
  let s = strategy.apply(u, p, i, d, cfg, rng);
  const min = Math.min(0, cfg.stateMin | 0);
  const max = Math.max(min, cfg.stateMax | 0);
  if (!Number.isFinite(s)) s = 0;
  if (s < min) s = min;
  else if (s > max) s = max;
  return s | 0;
}
