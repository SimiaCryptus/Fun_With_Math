import { validate } from './schema.js';

const BUILTIN = ['oscilloscope', 'spectrum-bars', 'plasma-storm', 'tunnel-of-love', 'gravity-well'];
const TRANSITION = 0.4;

/**
 * Safe expression evaluation over the SignalBus namespace. No eval.
 * Supports products of numbers and signal names: "jerk*0.004", "0.5", "bass*treb*2".
 */
export function evalExpr(expr, signals) {
  if (expr == null) return 0;
  if (typeof expr === 'number') return expr;
  let v = 1;
  for (const tok of String(expr).split('*')) {
    const t = tok.trim();
    if (/^-?\d*\.?\d+$/.test(t)) v *= parseFloat(t);
    else if (/^[a-zA-Z_]\w*$/.test(t)) v *= signals.get(t);
    else return 0;
  }
  return v;
}

/** Loads, validates, compiles (lazily) and switches presets. */
export class PresetManager {
  constructor(renderer, signals, events, store) {
    this.renderer = renderer; this.S = signals; this.E = events; this.store = store;
    this.defs = []; this.built = new Map();
    this.current = null; this.index = -1;
    this.params = new Float32Array(4);
    this.transition = 0;
  }

  async loadBuiltins() {
    const base = new URL('./builtin/', import.meta.url);
    const results = await Promise.allSettled(BUILTIN.map((id) => fetch(new URL(`${id}.json`, base)).then((r) => r.json())));
    for (const r of results) {
      if (r.status === 'fulfilled') this.add(r.value);
      else console.warn('[presets] load failed', r.reason);
    }
  }

  add(def) {
    const errs = validate(def);
    if (errs.length) { console.warn('[presets] rejected', def?.id, errs); return false; }
    if (def.requires.particles && !this.renderer.floatOK) def._unavailable = 'no float render targets';
    if (def.requires.webgl > 2) def._unavailable = 'needs newer WebGL';
    this.defs.push(def);
    return true;
  }

  get available() { return this.defs.filter((d) => !d._unavailable); }

  async select(idOrIndex) {
    const list = this.available;
    if (!list.length) return;
    const idx = typeof idOrIndex === 'number'
      ? ((idOrIndex % list.length) + list.length) % list.length
      : list.findIndex((d) => d.id === idOrIndex);
    if (idx < 0) return;
    const def = list[idx];
    let built = this.built.get(def.id);
    if (!built) {
      try {
        built = await this.renderer.buildPreset(def);
      } catch (e) {
        console.error(`[presets] ${def.id}`, e);
        def._unavailable = e.message.split('\n')[0];
        this.E.emit('toast', `Preset "${def.name}" unavailable: ${def._unavailable}`);
        return;
      }
      this.built.set(def.id, built);
    }
    this.index = idx;
    this.current = built;
    this.transition = TRANSITION;
    this.E.emit('preset:change', def);
    this.store?.put('prefs', 'preset', def.id).catch(() => {});
  }

  next() { return this.select(this.index + 1); }
  prev() { return this.select(this.index - 1); }
  random() {
    const n = this.available.length;
    if (n < 2) return this.select(0);
    let i;
    do i = Math.floor(Math.random() * n); while (i === this.index);
    return this.select(i);
  }

  /** Per-frame resolved values for the renderer (params, post expressions, transition). */
  frame(dt) {
    const def = this.current?.def;
    if (!def) return null;
    for (let i = 0; i < 4; i++) {
      const p = def.params[i];
      this.params[i] = p ? (p.bind ? this.S.get(p.bind) : p.default) : 0;
    }
    this.transition = Math.max(0, this.transition - dt);
    return {
      params: this.params,
      aberration: evalExpr(def.post.aberration, this.S),
      shatter: this.transition / TRANSITION,
    };
  }
}