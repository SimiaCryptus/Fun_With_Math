import { reconcile } from './diff.js';

/** Text ring model: characters with stable, monotonically assigned ids. */

export const SENTINEL_ID = 0;
export const SENTINEL_CH = '$';

let nextId = 1;

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function splitGraphemes(str) {
  if (!str) return [];
  if (segmenter) return Array.from(segmenter.segment(str), (s) => s.segment);
  return Array.from(str);
}

/** Convert a UTF-16 offset (as used by selectionStart) into a grapheme index. */
export function graphemeIndex(str, codeUnitOffset) {
  return splitGraphemes(str.slice(0, codeUnitOffset)).length;
}

export function createChars(text) {
  return splitGraphemes(text).map((ch) => ({ id: nextId++, ch }));
}

export const textOf = (chars) => chars.map((c) => c.ch).join('');

/**
 * Reconcile `chars` against `newText`.
 * Unchanged prefix/suffix keep ids; removed ids are reported; inserted chars get fresh ids.
 */
export function applyEdit(chars, newText, hint = null) {
  const oldArr = chars.map((c) => c.ch);
  const newArr = splitGraphemes(newText);
  const { start, end, insertEnd } = reconcile(oldArr, newArr, hint);

  const removed = new Set();
  for (let i = start; i < end; i++) removed.add(chars[i].id);
  const inserted = newArr.slice(start, insertEnd).map((ch) => ({ id: nextId++, ch }));

  return {
    chars: [...chars.slice(0, start), ...inserted, ...chars.slice(end)],
    removed,
    inserted,
  };
}

/** The ring actually displayed: chars plus the (optional) sentinel with its own stable id. */
export function ringOf(chars, sentinel) {
  return sentinel
    ? [...chars, { id: SENTINEL_ID, ch: SENTINEL_CH, sentinel: true }]
    : chars;
}