// lattice.js — primdir, gcd, L∞ ring index, ring<->perimeter bijection (§3.2, §3.7(3)).
// NOTE (plan header erratum): the metric is L∞ (Chebyshev) everywhere. No symbol
// named `l0` exists in this codebase, by policy (R14).
//
// METRIC ROLES — these are two different metrics and they are not interchangeable:
//   * ring / scheduling metric  = L∞ (Chebyshev) = MAX(|x|,|y|)  ← `linfIndex`
//   * intra-ring ordering metric = L2 (squared)                  ← order.js
// L∞ is the p→+∞ limit of the p-norms, so it is the MAX coordinate, not the min.
// The min-coordinate quantity min(|x|,|y|) is the p→-∞ limit; it is NOT a norm and
// NOT a metric (it vanishes on both coordinate axes, so ||v|| = 0 for v ≠ 0), which
// is why nothing here uses it and why no such function exists.
//
// Every entry point validates int32-ness with the cheap `(v | 0) !== v` test: these
// are hot-loop functions, and a non-integer silently propagating into key2 or a
// typed array produces a *wrong picture*, not a crash.
const isI32 = (v) => typeof v === 'number' && (v | 0) === v;


export function gcd(a, b) {
    if (!isI32(a) || !isI32(b)) throw new TypeError(`gcd: non-int32 arguments (${a}, ${b})`);
    a = a < 0 ? -a : a;
    b = b < 0 ? -b : b;
    while (b !== 0) {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
}

/** Primitive direction with the plan's sign normalization: x>0, or x==0 && y>0. */
export function primdir(vx, vy) {
    if (!isI32(vx) || !isI32(vy)) throw new TypeError(`primdir: non-int32 vector (${vx}, ${vy})`);
    if (vx === 0 && vy === 0) throw new Error('primdir(0,0) is undefined');
    const g = gcd(vx, vy);
    if (g === 0) throw new Error(`primdir: gcd(${vx},${vy}) === 0 (unreachable)`);
    let x = vx / g, y = vy / g;
    if (x < 0 || (x === 0 && y < 0)) {
        x = -x;
        y = -y;
    }
     // Negating a zero component yields -0, which is a *different* value under
     // Object.is (and therefore under assert.strictEqual and Map keys) while
     // printing identically. Canonicalise it away at the boundary.
     return [x === 0 ? 0 : x, y === 0 ? 0 : y];
}

/**
  * L∞ index (= ring) of a lattice point: MAX(|x|, |y|), i.e. the Chebyshev norm.
  *
  * This is the *bounding-box* metric: linfIndex(v) <= R  <=>  v lies in the axis
  * aligned square [-R,R]^2, and linfIndex(v) === R <=> v lies on its boundary
  * shell S_∞(R) (8R cells). It is emphatically NOT min(|x|,|y|): a point on an
  * axis, e.g. (7,0), has ring 7, not 0.
  *
  * Named `linfIndex`, never `l0` (R14).
  */
export function linfIndex(x, y) {
    if (!isI32(x) || !isI32(y)) throw new TypeError(`linfIndex: non-int32 point (${x}, ${y})`);
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    return ax > ay ? ax : ay;
}

/** |S_∞(R)| — the L∞ sphere is a square shell of exactly 8R cells (1 for R=0). */
export function ringLength(R) {
    if (!Number.isInteger(R) || R < 0) throw new RangeError(`ringLength: R must be a non-negative integer (got ${R})`);
    return R === 0 ? 1 : 8 * R;
}

// Perimeter indexing, clockwise from (0, R). Segments:
//   [0 .. R]        top,    y = R,  x = 0 .. R
//   [R+1 .. 3R]     right,  x = R,  y = R-1 .. -R
//   [3R+1 .. 5R]    bottom, y = -R, x = R-1 .. -R
//   [5R+1 .. 7R]    left,   x = -R, y = -R+1 .. R
//   [7R+1 .. 8R-1]  top,    y = R,  x = -R+1 .. -1
// This is a bijection: each of the 4 corners appears exactly once (§3.7(3)).
export function perimeterToCell(R, i, out) {
    out = out || [0, 0];
    if (!Number.isInteger(R) || R < 0) throw new RangeError(`perimeterToCell: bad ring ${R}`);
    if (!Number.isInteger(i) || i < 0 || i >= ringLength(R))
        throw new RangeError(`perimeterToCell: index ${i} outside [0, ${ringLength(R)}) for R=${R}`);
    if (typeof out.length !== 'number' || out.length < 2)
        throw new TypeError('perimeterToCell: `out` must be an array-like of length >= 2');
    if (R === 0) {
        out[0] = 0;
        out[1] = 0;
        return out;
    }
    if (i <= R) {
        out[0] = i;
        out[1] = R;
    } else if (i <= 3 * R) {
        out[0] = R;
        out[1] = 2 * R - i;
    } else if (i <= 5 * R) {
        out[0] = 4 * R - i;
        out[1] = -R;
    } else if (i <= 7 * R) {
        out[0] = -R;
        out[1] = i - 6 * R;
    } else {
        out[0] = i - 8 * R;
        out[1] = R;
    }
    return out;
}

export function cellToPerimeter(R, x, y) {
    if (!Number.isInteger(R) || R < 0) throw new RangeError(`cellToPerimeter: bad ring ${R}`);
    if (!isI32(x) || !isI32(y)) throw new TypeError(`cellToPerimeter: non-int32 cell (${x}, ${y})`);
    if (R === 0) return 0;
    if (y === R && x >= 0) return x;
    if (x === R) return 2 * R - y;
    if (y === -R) return 4 * R - x;
    if (x === -R) return y + 6 * R;
    if (y === R) return x + 8 * R;
    throw new Error(`cellToPerimeter: (${x},${y}) not on S_inf(${R})`);
}

/** Cheap numeric key for a lattice cell or a direction (|v| < 2^21). */
const KOFF = 1 << 21;

export function key2(x, y) {
    // Out-of-range coordinates would *collide* rather than fail — the worst kind of
    // bug for a set-membership key. Reject them at the door.
    if (x <= -KOFF || x >= KOFF || y <= -KOFF || y >= KOFF)
        throw new RangeError(`key2: (${x},${y}) outside |v| < 2^21 — keys would collide`);
    return (x + KOFF) * (2 * KOFF) + (y + KOFF);
}

export const KEY_LIMIT = KOFF;