/** Typed publish-subscribe dispatcher. Handlers are isolated so one failure cannot stall the turn pipeline. */
export class EventBus {
  constructor() { this._listeners = new Map(); }

  on(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => { off(); handler(payload); });
    return off;
  }

  off(type, handler) {
    const set = this._listeners.get(type);
    if (set) set.delete(handler);
  }

  emit(type, payload = {}) {
    const set = this._listeners.get(type);
    if (set) {
      for (const h of [...set]) {
        try { h(payload, type); } catch (err) { console.error(`[EventBus] ${type} handler failed`, err); }
      }
    }
    const any = this._listeners.get('*');
    if (any) for (const h of [...any]) { try { h(payload, type); } catch (err) { console.error(err); } }
  }

  clear() { this._listeners.clear(); }
}