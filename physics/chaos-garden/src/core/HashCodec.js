import { SHORT_KEYS, validate } from './Params.js';

const LONG_KEYS = Object.fromEntries(Object.entries(SHORT_KEYS).map(([k, v]) => [v, k]));

export function bytesToB64url(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlToBytes(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pushVarint(arr, n) { while (n >= 128) { arr.push((n & 127) | 128); n >>>= 7; } arr.push(n); }
function readVarint(b, pos) { let v = 0, sh = 0, x; do { x = b[pos++]; v |= (x & 127) << sh; sh += 7; } while (x & 128); return [v >>> 0, pos]; }

/** Run-length encode a 0/1 mask (runs alternate starting with 0) → base64url. */
export function encodeMask(mask, w, h) {
  const out = []; pushVarint(out, w); pushVarint(out, h);
  let cur = 0, run = 0;
  for (let n = 0; n < w * h; n++) { const m = mask[n] ? 1 : 0; if (m === cur) run++; else { pushVarint(out, run); cur ^= 1; run = 1; } }
  pushVarint(out, run);
  return bytesToB64url(Uint8Array.from(out));
}
export function decodeMask(str) {
  const b = b64urlToBytes(str); let pos = 0, w, h, run;
  [w, pos] = readVarint(b, pos); [h, pos] = readVarint(b, pos);
  const mask = new Uint8Array(w * h); let n = 0, cur = 0;
  while (pos < b.length && n < mask.length) { [run, pos] = readVarint(b, pos); if (cur) mask.fill(1, n, Math.min(n + run, mask.length)); n += run; cur ^= 1; }
  return { w, h, mask };
}
export function encodeParams(p) {
  const o = {}; for (const [k, s] of Object.entries(SHORT_KEYS)) if (k in p) o[s] = p[k];
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
}
export function decodeParams(str) {
  const o = JSON.parse(new TextDecoder().decode(b64urlToBytes(str))); const p = {};
  for (const [s, v] of Object.entries(o)) if (LONG_KEYS[s]) p[LONG_KEYS[s]] = v;
  return validate(p).normalized;
}
/** `#cg1.<params-b64>.<design-b64>` */
export function encodeState({ params, mask, w, h }) { return `cg1.${encodeParams(params)}.${encodeMask(mask, w, h)}`; }
export function decodeState(hash) {
  try {
    const s = (hash || '').replace(/^#/, ''); const parts = s.split('.');
    if (parts[0] !== 'cg1' || parts.length < 3) return null;
    return { params: decodeParams(parts[1]), ...decodeMask(parts[2]) };
  } catch { return null; }
}
export function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
/** runHash = H(designHash ‖ params ‖ seed ‖ solverVersion). tier/backend are machine choices; the backend (and GPU vendor) enter via solverVersion. */
export function runHash({ design, params, solverVersion }) {
   const p = { ...params }; const seed = p.seed; delete p.tier; delete p.backend;
  return fnv1a(`${fnv1a(design)}|${JSON.stringify(p)}|${seed}|${solverVersion}`);
}