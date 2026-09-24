/**
 * Selection semantics. Selection is a Set of stable char ids; the anchor is an id.
 *
 * - plain click:        { id }, anchor = id
 * - ctrl/cmd click:     toggle id, anchor = id
 * - shift click:        range from anchor to id, FORWARD in ring order (wrapping)
 * - shift+ctrl/cmd:     add that range to the existing selection
 */
export function select(state, id, { toggle = false, range = false } = {}, ring) {
  const posOf = new Map(ring.map((c, i) => [c.id, i]));
  if (!posOf.has(id)) return { selection: state.selection, anchor: state.anchor };

  if (range && state.anchor != null && posOf.has(state.anchor)) {
    const n = ring.length;
    const a = posOf.get(state.anchor);
    const b = posOf.get(id);
    const span = (b - a + n) % n;
    const ids = [];
    for (let k = 0; k <= span; k++) ids.push(ring[(a + k) % n].id);
    const next = toggle ? new Set(state.selection) : new Set();
    for (const i of ids) next.add(i);
    return { selection: next, anchor: state.anchor, range: ids };
  }

  if (toggle) {
    const next = new Set(state.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selection: next, anchor: id };
  }

  return { selection: new Set([id]), anchor: id };
}

export function cleared() {
  return { selection: new Set(), anchor: null };
}

/** Drop ids that no longer exist from selection / anchor / hover. */
export function prune(state, removed) {
  const selection = new Set([...state.selection].filter((id) => !removed.has(id)));
  return {
    selection,
    anchor: removed.has(state.anchor) ? null : state.anchor,
    hover: removed.has(state.hover) ? null : state.hover,
  };
}