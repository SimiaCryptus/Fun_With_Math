/** Tiny typed pub/sub. */
export class EventBus {
  constructor() { this._m = new Map(); }
  on(type, fn) { if (!this._m.has(type)) this._m.set(type, new Set()); this._m.get(type).add(fn); return () => this.off(type, fn); }
  off(type, fn) { this._m.get(type)?.delete(fn); }
  once(type, fn) { const off = this.on(type, (p) => { off(); fn(p); }); return off; }
  emit(type, payload) { const s = this._m.get(type); if (!s) return; for (const fn of [...s]) fn(payload); }
}
export const bus = new EventBus();