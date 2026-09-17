// Tiny typed event emitter (no DOM dependency).
export class Emitter {
  constructor() {
    this._handlers = new Map();
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (detail) => {
      off();
      fn(detail);
    });
    return off;
  }

  off(type, fn) {
    this._handlers.get(type)?.delete(fn);
  }

  emit(type, detail) {
    for (const fn of [...(this._handlers.get(type) ?? [])]) fn(detail);
    for (const fn of [...(this._handlers.get("*") ?? [])]) fn({ type, detail });
  }
}