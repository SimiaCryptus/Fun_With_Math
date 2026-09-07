/** Tiny synchronous pub/sub. Handlers are invoked in subscription order. */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(name, fn) {
    this.listeners.get(name)?.delete(fn);
  }

  emit(name, payload) {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear() {
    this.listeners.clear();
  }
}