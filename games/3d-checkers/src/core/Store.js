// Tiny settings store persisted to localStorage.
export class Store {
  constructor(key, defaults) {
    this.key = key;
    this.defaults = defaults;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { saved = {}; }
    this.data = { ...defaults, ...saved };
  }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  all() { return { ...this.data }; }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* ignore */ } }
}