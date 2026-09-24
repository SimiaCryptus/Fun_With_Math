/**
 * Old/new reconciliation over arrays of graphemes.
 *
 * Result: `{ start, end, insertEnd }` meaning
 *   new = old[0:start] + new[start:insertEnd] + old[end:]
 */

export function reconcile(oldArr, newArr, hint) {
  if (hint) {
    const r = fromHint(oldArr, newArr, hint);
    if (r) return r;
  }
  return fromPrefixSuffix(oldArr, newArr);
}

/**
 * Uses the selection before the edit and the caret after it.
 * With one contiguous replacement and the caret landing after the inserted text:
 *   start = min(oldStart, newCaret), end = oldLen - newLen + newCaret.
 * Covers typing, pasting, replacing a selection, backward/forward/word deletion.
 * The candidate is verified; anything inconsistent (e.g. odd undo carets) returns null.
 */
function fromHint(o, nw, { oldStart, oldEnd, newCaret }) {
  if (![oldStart, oldEnd, newCaret].every(Number.isInteger)) return null;
  const start = Math.min(oldStart, newCaret);
  const end = o.length - nw.length + newCaret;
  if (start < 0 || end < start || end > o.length || newCaret > nw.length) return null;
  if (oldEnd > oldStart && (start > oldStart || end < oldEnd)) return null;

  for (let i = 0; i < start; i++) if (o[i] !== nw[i]) return null;
  for (let i = end; i < o.length; i++) if (o[i] !== nw[newCaret + i - end]) return null;
  return { start, end, insertEnd: newCaret };
}

function fromPrefixSuffix(o, nw) {
  const max = Math.min(o.length, nw.length);
  let p = 0;
  while (p < max && o[p] === nw[p]) p++;
  let s = 0;
  while (s < max - p && o[o.length - 1 - s] === nw[nw.length - 1 - s]) s++;
  return { start: p, end: o.length - s, insertEnd: nw.length - s };
}