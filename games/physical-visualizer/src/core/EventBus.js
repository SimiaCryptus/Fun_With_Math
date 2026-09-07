/** Tiny synchronous pub/sub. */
export class EventBus {
  #m = new Map();

  on(type, fn) {
    if (!this.#m.has(type)) this.#m.set(type, new Set());
    this.#m.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }

  off(type, fn) { this.#m.get(type)?.delete(fn); }

  emit(type, payload) {
    this.#m.get(type)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[EventBus:${type}]`, e); }
    });
  }
}