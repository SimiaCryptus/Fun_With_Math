export const fmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');

export function sci(x, digits = 4) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -3 && e <= 5) return x.toFixed(Math.max(0, digits - 1 - e));
  return `${(x / 10 ** e).toFixed(digits - 1)}e${e}`;
}

/** Render a number given only its base-10 logarithm (for primorial-scale values). */
export function fromLog10(log10v, digits = 3) {
  if (!Number.isFinite(log10v)) return '—';
  const e = Math.floor(log10v);
  const m = 10 ** (log10v - e);
  if (e >= 0 && e <= 6) return sci(m * 10 ** e, digits + 1);
  return `${m.toFixed(digits)}e${e}`;
}

export function bigStr(L, maxLen = 16) {
  const s = L.toString();
  return s.length <= maxLen ? s : `${s.slice(0, 5)}…(${s.length} digits)`;
}

export const pct = (x, d = 3) => `${(100 * x).toFixed(d)}%`;