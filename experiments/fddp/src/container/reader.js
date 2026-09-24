import { parseChunks } from './chunks.js';
import { unpackFhdr } from './fhdr.js';
import { fail, check } from '../core/errors.js';
import { LIMITS } from '../core/registry.js';

export function readContainer(bytes, { strict = true } = {}) {
  const out = { xtra: [], data: [], chunkList: [] };
  let sawIend = false;
  for (const ch of parseChunks(bytes)) {
    out.chunkList.push({ type: ch.type, offset: ch.offset, length: ch.length, critical: ch.critical });
    switch (ch.type) {
      case 'FHDR': out.fhdr = unpackFhdr(ch.payload); break;
      case 'LANE': out.lane = parseLane(ch.payload); break;
      case 'XFRM': out.xfrm = parseXfrm(ch.payload); break;
      case 'BAND': out.band = parseBand(ch.payload); break;
      case 'CHAN': out.chan = Array.from(ch.payload.subarray(1, 1 + ch.payload[0])); break;
      case 'NORM': out.norm = parseNorm(ch.payload); break;
      case 'QUAN': out.quan = { scheme: ch.payload[0], bits: ch.payload[1],
                                codebook: ch.payload.subarray(2, 34) }; break;
      case 'POSI': out.posi = ch.payload; break;
      case 'SEGS': out.segs = ch.payload; break;
      case 'DATA': out.data.push(ch.payload); break;
      case 'STAT': out.stat = parseStat(ch.payload); break;
      case 'XTRA': out.xtra.push(parseXtra(ch.payload)); break;
      case 'IEND': sawIend = true; break;
      default:
        // §15.3 — reject unrecognised CRITICAL, skip unrecognised ancillary.
        if (ch.critical)
          fail('FDDP_E_UNKNOWN_CRITICAL', `unrecognised critical chunk "${ch.type}"`);
    }
  }
  if (!sawIend) fail('FDDP_E_TRUNCATED', 'container ends before IEND');
  for (const req of ['fhdr', 'lane', 'xfrm', 'band', 'chan', 'norm', 'quan'])
    check(out[req], 'FDDP_E_TRUNCATED', `required chunk ${req.toUpperCase()} absent`);

  // Concatenate DATA without trusting token_count for the allocation size.
  let total = 0;
  for (const d of out.data) total += d.length;
  const dataBytes = new Uint8Array(total);
  { let o = 0; for (const d of out.data) { dataBytes.set(d, o); o += d.length; } }
  out.dataView = dataBytes;

  if (strict) {
    // §18.1 — token_count is ADVISORY. Reconcile it against actual DATA length
    // and fail on divergence BEFORE any allocation keyed on it.
    check(out.fhdr.token_count <= LIMITS.MAX_TOKENS, 'FDDP_E_TOKEN_BUDGET',
          `header claims ${out.fhdr.token_count} tokens`);
    check(out.fhdr.L <= LIMITS.MAX_LANES_FULL, 'FDDP_E_LANE_BUDGET', 'L exceeds any class limit');
  }
  return out;
}

function parseLane(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const L = dv.getUint16(0, true);
  check(p.length >= 2 + L * 11, 'FDDP_E_TRUNCATED', 'LANE payload short');
  const lanes = [];
  for (let i = 0; i < L; i++) {
    const o = 2 + i * 11;
    lanes.push({ kind: dv.getUint8(o), parent: dv.getUint16(o + 1, true),
                 offset: dv.getFloat32(o + 3, true), scale: dv.getFloat32(o + 7, true) });
  }
  return lanes;
}

function parseXfrm(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const S = dv.getUint8(0);
  const scales = [];
  for (let s = 0; s < S; s++) {
    const o = 1 + s * 19;
    scales.push({
      Nr: dv.getUint16(o, true), Nc: dv.getUint16(o + 2, true),
      Hr: dv.getUint16(o + 4, true), Hc: dv.getUint16(o + 6, true),
      window: dv.getUint8(o + 8), windowParam: dv.getFloat32(o + 9, true),
      transform: dv.getUint8(o + 13), scaling: dv.getUint8(o + 14),
      K: dv.getUint32(o + 15, true),
    });
  }
  return scales;
}

function parseBand(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const scheme = dv.getUint8(1), J = dv.getUint16(2, true);
  check(p.length >= 4 + (J + 1) * 4, 'FDDP_E_TRUNCATED', 'BAND payload short');
  const edges = new Uint32Array(J + 1);
  for (let i = 0; i <= J; i++) edges[i] = dv.getUint32(4 + i * 4, true);
  for (let i = 1; i <= J; i++)
    if (edges[i] <= edges[i - 1]) fail('FDDP_E_BAND_DEGENERATE', `BAND edge ${i} non-monotone`);
  return { scheme, J, edges };
}

function parseNorm(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return { mode: dv.getUint8(0), lambda: dv.getFloat32(1, true), quantRange: dv.getFloat32(5, true) };
}

function parseXtra(p) {
  const sub = String.fromCharCode(p[0], p[1], p[2], p[3]);
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  if (sub === 'IMGD') {
    return { sub, width: dv.getUint32(4, true), height: dv.getUint32(8, true),
             widthPad: dv.getUint32(12, true), heightPad: dv.getUint32(16, true),
             colourXform: dv.getUint8(20), blockSize: dv.getUint8(21),
             groupW: dv.getUint8(22), groupH: dv.getUint8(23) };
  }
  if (sub === 'BYTD') {
    return { sub, length: Number(dv.getBigUint64(4, true)),
             T: dv.getUint32(12, true), nGroups: dv.getUint32(16, true) };
  }
  return { sub, payload: p.subarray(4) };
}

function parseStat(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const idLen = dv.getUint16(48, true);
  const id = new TextDecoder().decode(p.subarray(50, 50 + idLen));
  const jsonLen = dv.getUint32(50 + idLen, true);
  let metrics = {};
  try { metrics = JSON.parse(new TextDecoder().decode(p.subarray(54 + idLen, 54 + idLen + jsonLen))); }
  catch (e) { metrics = { parseError: String(e) }; }   // ancillary chunk: not fatal, but not silent
  return { sourceLength: Number(dv.getBigUint64(0, true)), digest: p.subarray(8, 40),
           nonfinite: dv.getUint32(40, true), clamp: dv.getUint32(44, true), encoderId: id, metrics };
}