/** Tiny synchronous event bus. `emit` queues; `flush` delivers in order. */
export class EventBus {
  constructor() {
    this.handlers = new Map();
    this.queue = [];
  }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, payload) {
    this.queue.push({ type, payload });
  }
  flush() {
    if (this.queue.length === 0) return;
    const q = this.queue;
    this.queue = [];
    for (const e of q) {
      const hs = this.handlers.get(e.type);
      if (hs) for (const h of hs) h(e.payload, e.type);
      const all = this.handlers.get('*');
      if (all) for (const h of all) h(e.payload, e.type);
    }
  }
  clear() {
    this.queue.length = 0;
  }
}