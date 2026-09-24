/**
 * Single source of truth + tiny pub/sub.
 * `set(patch, events)` shallow-merges the patch and then emits the named events.
 */
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Map();

  function subscribe(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function emit(event) {
    for (const fn of listeners.get(event) ?? []) fn(state, event);
    for (const fn of listeners.get('*') ?? []) fn(state, event);
  }

  function set(patch, events = []) {
    state = { ...state, ...patch };
    for (const event of [].concat(events)) emit(event);
  }

  return { get: () => state, set, subscribe, emit };
}