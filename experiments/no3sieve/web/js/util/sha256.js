// sha256.js — pure-JS SHA-256 so config/point hashes work in any context,
// including file:// where crypto.subtle is unavailable (S3 needs a stable hash).
const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(bytes) {
    if (!(bytes instanceof Uint8Array)) {
        if (ArrayBuffer.isView(bytes)) bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        else if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
        else throw new TypeError('sha256: expected a Uint8Array / ArrayBufferView / ArrayBuffer');
    }
    const l = bytes.length;
    if (l > (1 << 28)) throw new RangeError(`sha256: ${l} bytes is too large for this pure-JS implementation`);
    const withPad = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(withPad);
    m.set(bytes);
    m[l] = 0x80;
    const bits = l * 8;
    const dv = new DataView(m.buffer);
    dv.setUint32(withPad - 4, bits >>> 0);
    dv.setUint32(withPad - 8, Math.floor(bits / 4294967296));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let off = 0; off < withPad; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const mj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + mj) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0;
        H[1] = (H[1] + b) >>> 0;
        H[2] = (H[2] + c) >>> 0;
        H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0;
        H[5] = (H[5] + f) >>> 0;
        H[6] = (H[6] + g) >>> 0;
        H[7] = (H[7] + h) >>> 0;
    }
    let out = '';
    for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, '0');
    return out;
}

export function sha256Text(s) {
    if (typeof s !== 'string') throw new TypeError(`sha256Text: expected a string (got ${typeof s})`);
    return sha256(new TextEncoder().encode(s));
}

/** Canonical JSON: sorted keys, no whitespace — the basis of `config_hash`. */
export function canonicalJson(v, seen = new Set()) {
    // A hash is only useful if it is total and stable: undefined/NaN/functions and
    // cycles must fail loudly rather than produce `undefined` inside the digest.
    const t = typeof v;
    if (v === null) return 'null';
    if (t === 'number') {
        if (!Number.isFinite(v)) throw new TypeError(`canonicalJson: non-finite number (${v}) is not representable`);
        return JSON.stringify(v);
    }
    if (t === 'string' || t === 'boolean') return JSON.stringify(v);
    if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint')
        throw new TypeError(`canonicalJson: value of type ${t} cannot be canonicalised`);
    if (ArrayBuffer.isView(v)) v = Array.from(v);
    if (seen.has(v)) throw new TypeError('canonicalJson: cyclic structure');
    seen.add(v);
    let out;
    if (Array.isArray(v)) out = '[' + v.map((e) => canonicalJson(e, seen)).join(',') + ']';
    else {
        const keys = Object.keys(v).sort();
        out = '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k], seen)).join(',') + '}';
    }
    seen.delete(v);
    return out;
}

export function configHash(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new TypeError('configHash: cfg must be an object');
    if (typeof cfg.version !== 'string') throw new TypeError('configHash: cfg.version must be a string');
    return sha256Text(canonicalJson(cfg) + '|' + cfg.version);
}

export function pointsHash(points) {
    if (!ArrayBuffer.isView(points))
        throw new TypeError('pointsHash: expected a typed array (the byte layout is part of the hash)');
    return sha256(new Uint8Array(points.buffer, points.byteOffset, points.byteLength));
}