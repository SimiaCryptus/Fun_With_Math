/** Minimal observable state container. */
export class Store {
  constructor(initial = {}) {
    this.state = initial;
    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  set(patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (this.state[k] !== v) changed = true;
    }
    if (!changed) return this.state;
    this.state = { ...this.state, ...patch };
    this.emit();
    return this.state;
  }

  /** Toggle membership of `value` in the Set held at `key`. */
  toggleIn(key, value) {
    const next = new Set(this.state[key]);
    next.has(value) ? next.delete(value) : next.add(value);
    return this.set({ [key]: next });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch (err) {
        console.error('store listener failed', err);
      }
    }
  }
}
