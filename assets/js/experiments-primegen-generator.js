/* =====================================================================
UI + number spiral.  The algorithms themselves live in three
self-contained modules, so that each can be read on its own:
    algorithm-a.js    exact one-touch streams        (algorithm.md §3)
    algorithm-b.js    wheeled streams                (algorithm.md §4)
    algorithm-c.js    min-factor exponent spine      (§4C, min_factor.md)
with primegen-core.js holding the wheel tables, the min-heap and the
reference sieve.  Every module exports the same four things:
    meta            id / title / spec reference / blurb
    stream(opts)    the unbounded generator
    run(N, opts)    bounded driver → { primes, stats, wheel }
    summary(res,N)  algorithm-specific report lines
===================================================================== */
import { assertExact, sieveRef } from './primegen-core.js';
import * as AlgA from './algorithm-a.js';
import * as AlgB from './algorithm-b.js';
import * as AlgC from './algorithm-c.js';

const ALGOS = { A: AlgA, B: AlgB, C: AlgC };
const currentAlgo = () => ALGOS[$('algo').value] || AlgB;

/* The only bitwise code below is the packed bitset of the number spiral;
     `&`, `|` and `>>>` truncate to 32 bits, so those indices are asserted
     to stay under 2^31 (assertExact guards the 2^53 side). */
/* =====================================================================
Ulam spiral — exact bitset + pre-computed density mip pyramid
---------------------------------------------------------------------
The grid is stored once as a packed L×L bit mask (1 bit / cell).  Three
rendering regimes are picked from the zoom level:

  cellPx ≥ 1        one cell covers ≥ 1 device pixel  → exact
                    nearest-neighbour sample of the mask (crisp)
  1 > cellPx ≥ ½    a device pixel covers ≤ 4 cells   → exact box
                    average of the mask (anti-aliased density)
  cellPx < ½        a device pixel covers many cells  → pre-computed
                    density mip level whose texel is 1–2 device px,
                    drawn with bilinear filtering

Nearest-neighbour *downscaling* — what the previous version handed to
drawImage — silently discards most primes when zoomed out (moiré, points
popping in and out while panning); averaging removes that entirely.
Every path touches only the visible sub-rectangle, so pan/zoom costs
O(viewport pixels) independent of L.
===================================================================== */
const MAX_SIDE = 8192; // L² bits = 8 MB bitset at the cap
const MAX_RING = (MAX_SIDE - 1) >> 1; // hex mode: axial box side 2R+1 ≤ MAX_SIDE
const MAX_TEX = 2048; // largest offscreen texture side we allocate
const GAMMA = 0.6; // density → brightness curve
const BG_RGB = [0x0b, 0x0f, 0x15];
const FG_RGB = [0x7e, 0xe0, 0xc0];
const TW_RGB = [0xff, 0x7b, 0x72]; // twin primes (p, p+2)
/* hex lattice, pointy-top, cell width 1:
        X(q,r) = q + r/2 + R + 0.5      (columns are sheared by half a cell)
        Y(q,r) = (r + R + 0.5)·√3/2     (row pitch = √3/2, hex area = √3/2)
      so one hex occupies exactly the same area as one square cell of width 1. */
const HEX_K = Math.sqrt(3) / 2; // row pitch
const HEX_DQ = [1, 1, 0, -1, -1, 0]; // the six axial directions, CCW on screen
const HEX_DR = [0, -1, -1, 0, 1, 1];
/* endianness-agnostic pixel packing for the Uint32 view of an ImageData */
const packRGBA = (() => {
  const buf = new ArrayBuffer(4),
    u8 = new Uint8Array(buf),
    u32 = new Uint32Array(buf);
  return (r, g, b, a = 255) => {
    u8[0] = r;
    u8[1] = g;
    u8[2] = b;
    u8[3] = a;
    return u32[0];
  };
})();
const BG_PX = packRGBA(...BG_RGB);
/* (TW_STEPS+1) × 257 colour table:
       row j → twin fraction u = j/TW_STEPS, hue = accent ⊕ twin-red
       col i → density t = i/256,            colour = background ⊕ hue
     Every density path accumulates *counts* (primes and twins separately)
     and converts to RGB only here, so a mip texel is the area-correct
     average of both channels — summarising RGB directly would wash the red
     out (or drop it entirely) as soon as a texel covers > 1 cell. */
const TW_STEPS = 32;
const RAMP = (() => {
  const r = new Uint32Array((TW_STEPS + 1) * 257);
  for (let j = 0; j <= TW_STEPS; j++) {
    const u = j / TW_STEPS;
    const hue = [0, 1, 2].map((c) => FG_RGB[c] + (TW_RGB[c] - FG_RGB[c]) * u);
    for (let i = 0; i <= 256; i++) {
      const t = i / 256;
      r[j * 257 + i] = packRGBA(
        Math.round(BG_RGB[0] + (hue[0] - BG_RGB[0]) * t),
        Math.round(BG_RGB[1] + (hue[1] - BG_RGB[1]) * t),
        Math.round(BG_RGB[2] + (hue[2] - BG_RGB[2]) * t)
      );
    }
  }
  return r;
})();
/* twin fraction → ramp row offset; rampPx(density index, twin fraction) */
const twRow = (f) => (f > 0 ? (f >= 1 ? TW_STEPS : Math.round(f * TW_STEPS)) : 0) * 257;
const rampPx = (idx, frac) => RAMP[twRow(frac) + idx];
const PX_PRIME = RAMP[256]; // solid accent
const PX_TWIN = RAMP[TW_STEPS * 257 + 256]; // solid red

const spiralCanvas = () => document.getElementById('spiralCanvas');
let spiralMask = null; // Uint32Array bitset over the L×L grid
let spiralTwin = null; // same shape: 1 where the cell's n is a twin prime
let spiralL = 0;
let spiralLevels = []; // [{ canvas, size, cell }] — cell = cells per texel
let spiralRef = 1e-6; // reference density for the brightness ramp
let spiralCount = 0; // primes actually placed in the grid
let spiralView = { scale: 1, tx: 0, ty: 0, min: 0.01 };
let lastSpiral = null; // { primes, N, w } from the latest generator run
let renderPending = false;
let exactImg = null; // reused ImageData for the exact paths
let spiralMode = 'square'; // 'square' (Ulam) | 'hex'
let spiralR = 0; // hex mode: ring count, mask side = 2R+1
let spiralCells = 0; // integers enumerated by the walk (L² or 1+3R(R+1))
let spiralFill = 1; // enumerated cells / mask cells (hex ⇒ ≈ 3/4)
let spiralExtW = 0; // grid bounding box in cell units (fit + clipping)
let spiralExtH = 0;
let spiralLabel = ''; // HUD prefix
let spiralOrigin = 1; // integer sitting on the centre cell (0…3)
let spiralLast = 0; // largest integer placed on the grid
let hexCounts = null; // reused accumulators for the hex scatter paths
let hexTwins = null;

/* density → ramp index; spiralRef ≈ 4·(global density) keeps mid-tones lit */
function shade(dens) {
  if (!(dens > 0)) return 0;
  const t = Math.pow(dens / spiralRef, GAMMA);
  return t >= 1 ? 256 : Math.round(256 * t);
}

/* isPrime / isTwin bitsets over [0, hi]; twin = member of a pair (p, p+2).
     `primes` must extend to hi+2 for the top cell to be classified right. */
function primeBitsets(primes, hi) {
  const bits = (n) => new Uint32Array(Math.ceil((n + 1) / 32));
  const isPrime = bits(hi),
    isTwin = bits(hi);
  for (let i = 0; i < primes.length; i++) {
    const p = primes[i];
    if (p > hi) break; // primes[] is ascending
    isPrime[p >>> 5] |= 1 << (p & 31);
  }
  for (let i = 1; i < primes.length; i++) {
    if (primes[i] - primes[i - 1] !== 2) continue;
    const a = primes[i - 1],
      b = primes[i];
    if (a <= hi) isTwin[a >>> 5] |= 1 << (a & 31);
    if (b <= hi) isTwin[b >>> 5] |= 1 << (b & 31);
    if (a > hi) break;
  }
  return { isPrime, isTwin };
}

/* --- full-resolution prime mask over the spiral grid (1 bit per cell) --- */
function buildSpiralMask(primes, L, origin) {
  const cells = L * L;
  const last = origin + cells - 1; // centre cell holds `origin`
  /* bit indices are used with `&`/`|`/`>>>`, which truncate to 32 bits */
  assertExact(cells, 'L²');
  if (cells >= 0x80000000) throw new RangeError(`spiral side ${L} exceeds the 32-bit bitset range`);
  const bitset = (n) => new Uint32Array(Math.ceil(n / 32));
  const { isPrime, isTwin } = primeBitsets(primes, last);
  const mask = bitset(cells),
    twin = bitset(cells);
  const dx = [1, 0, -1, 0],
    dy = [0, -1, 0, 1];
  let x = L >> 1,
    y = L >> 1,
    n = origin,
    dir = 0,
    len = 1,
    count = 0;
  const put = () => {
    /* bounds check: for even L the walk leaves the grid on one side */
    if ((isPrime[n >>> 5] >>> (n & 31)) & 1 && x >= 0 && x < L && y >= 0 && y < L) {
      const i = y * L + x;
      mask[i >>> 5] |= 1 << (i & 31);
      if ((isTwin[n >>> 5] >>> (n & 31)) & 1) twin[i >>> 5] |= 1 << (i & 31);
      count++;
    }
  };
  put(); // n = origin at the centre
  while (n < last) {
    for (let leg = 0; leg < 2 && n < last; leg++) {
      for (let s = 0; s < len && n < last; s++) {
        x += dx[dir];
        y += dy[dir];
        n++;
        put();
      }
      dir = (dir + 1) & 3;
    }
    len++;
  }
  spiralCount = count;
  spiralCells = cells;
  spiralOrigin = origin;
  spiralLast = last;
  spiralFill = 1;
  spiralExtW = L;
  spiralExtH = L;
  spiralLabel = `L = ${fmt(L)} · n₀ = ${origin}`;
  spiralRef = Math.max(1e-6, Math.min(1, (4 * count) / cells));
  return { mask, twin };
}
/* --- hexagonal ring spiral over the triangular lattice ---------------
      Ring k holds 6k cells, so the plot covers n ≤ H_R = 1 + 3R(R+1) (the
      centred hexagonal numbers).  The walk takes one step outward and then
      follows the ring, hence consecutive integers are always neighbours —
      the defining property of the Ulam spiral, transplanted to hexes.
      Cells live in an axial (2R+1)² bit box, indexed (r+R)·D + (q+R); the
      ~25% of the box outside the hexagon simply stays zero, which lets the
      square-grid mip pyramid and viewport code be reused verbatim.        */
function buildHexMask(primes, R, origin) {
  const D = 2 * R + 1;
  const box = D * D;
  const cells = 1 + 3 * R * (R + 1);
  const last = origin + cells - 1;
  assertExact(box, '(2R+1)²');
  if (box >= 0x80000000) throw new RangeError(`hex radius ${R} exceeds the 32-bit bitset range`);
  const bitset = (n) => new Uint32Array(Math.ceil(n / 32));
  const { isPrime, isTwin } = primeBitsets(primes, last);
  const mask = bitset(box),
    twin = bitset(box);
  let q = 0,
    r = 0,
    n = origin,
    count = 0;
  const put = () => {
    if ((isPrime[n >>> 5] >>> (n & 31)) & 1 && q >= -R && q <= R && r >= -R && r <= R) {
      const i = (r + R) * D + (q + R);
      mask[i >>> 5] |= 1 << (i & 31);
      if ((isTwin[n >>> 5] >>> (n & 31)) & 1) twin[i >>> 5] |= 1 << (i & 31);
      count++;
    }
  };
  put(); // n = origin at the centre
  for (let k = 1; n < last; k++) {
    /* 1 step outward, k−1 along the edge we entered on, then k per side */
    const legs = [
      [0, 1],
      [1, k - 1],
      [2, k],
      [3, k],
      [4, k],
      [5, k],
      [0, k],
    ];
    for (const [d, len] of legs)
      for (let s = 0; s < len && n < last; s++) {
        q += HEX_DQ[d];
        r += HEX_DR[d];
        n++;
        put();
      }
  }
  spiralCount = count;
  spiralCells = cells;
  spiralOrigin = origin;
  spiralLast = last;
  spiralFill = cells / box; // mip densities are per box cell, not per hex
  spiralExtW = D; // X ∈ [0, D]
  spiralExtH = D * HEX_K; // Y ∈ [0, D·√3/2]
  spiralLabel = `hex R = ${fmt(R)} · n₀ = ${origin}`;
  spiralRef = Math.max(1e-6, Math.min(1, (4 * count) / cells));
  return { mask, twin };
}

/* --- mip pyramid of *densities*, base texel ≤ MAX_TEX per side --- */
function buildSpiralLevels(mask, twin, L) {
  let cell = 1;
  while (Math.ceil(L / cell) > MAX_TEX) cell <<= 1;
  let size = Math.ceil(L / cell);
  const shift = Math.round(Math.log2(cell));
  /* histogram the set bits (iterate primes, not the L² cells) */
  let counts = new Uint32Array(size * size),
    twins = new Uint32Array(size * size);
  const hist = (bits, out) => {
    for (let w = 0; w < bits.length; w++) {
      let word = bits[w];
      while (word) {
        const lsb = word & -word;
        word ^= lsb;
        const i = (w << 5) + (31 - Math.clz32(lsb));
        const y = (i / L) | 0;
        out[(y >>> shift) * size + ((i - y * L) >>> shift)]++;
      }
    }
  };
  hist(mask, counts);
  hist(twin, twins);
  const levels = [];
  for (;;) {
    levels.push({ canvas: levelCanvas(counts, twins, size, cell), size, cell });
    if (size <= 2) return levels;
    const nsize = Math.ceil(size / 2);
    const next = new Uint32Array(nsize * nsize),
      ntwin = new Uint32Array(nsize * nsize);
    for (let y = 0; y < size; y++) {
      const out = (y >> 1) * nsize,
        row = y * size;
      for (let x = 0; x < size; x++) {
        /* sum both channels — never the packed pixels */
        next[out + (x >> 1)] += counts[row + x];
        ntwin[out + (x >> 1)] += twins[row + x];
      }
    }
    counts = next;
    twins = ntwin;
    size = nsize;
    cell *= 2;
  }
}

function levelCanvas(counts, twins, size, cell) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d', { alpha: false });
  const img = ctx.createImageData(size, size);
  const px = new Uint32Array(img.data.buffer);
  const area = cell * cell;
  /* spiralFill < 1 in hex mode: only that fraction of the box cells is a hex */
  const per = 1 / (area * spiralFill);
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i];
    px[i] = n ? rampPx(shade(n * per), twins[i] / n) : BG_PX;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* --- rendering ------------------------------------------------------ */
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    renderSpiral();
  });
}

function viewportImageData(ctx, w, h) {
  if (!exactImg || exactImg.width !== w || exactImg.height !== h)
    exactImg = ctx.createImageData(w, h);
  return exactImg;
}

/* exact regimes: sample / box-average the bitset, visible pixels only */
function drawExact(ctx, canvas, cellPx, ox, oy) {
  const x0 = Math.max(0, Math.floor(ox)),
    y0 = Math.max(0, Math.floor(oy)),
    x1 = Math.min(canvas.width, Math.ceil(ox + spiralL * cellPx)),
    y1 = Math.min(canvas.height, Math.ceil(oy + spiralL * cellPx));
  if (x1 <= x0 || y1 <= y0) return 'off screen';
  const w = x1 - x0,
    h = y1 - y0;
  const img = viewportImageData(ctx, w, h);
  const px = new Uint32Array(img.data.buffer);
  px.fill(BG_PX);
  const mask = spiralMask,
    twin = spiralTwin,
    L = spiralL,
    inv = 1 / cellPx;
  let label;
  if (cellPx >= 1) {
    for (let py = y0; py < y1; py++) {
      const cy = Math.floor((py + 0.5 - oy) * inv);
      if (cy < 0 || cy >= L) continue;
      const row = cy * L,
        out = (py - y0) * w - x0;
      for (let p = x0; p < x1; p++) {
        const cx = Math.floor((p + 0.5 - ox) * inv);
        if (cx < 0 || cx >= L) continue;
        const i = row + cx;
        if ((mask[i >>> 5] >>> (i & 31)) & 1)
          px[out + p] = (twin[i >>> 5] >>> (i & 31)) & 1 ? PX_TWIN : PX_PRIME;
      }
    }
    label = `exact · ${cellPx.toFixed(1)} px/cell`;
  } else {
    /* ≤ 4 cells per pixel: average them, so nothing can be dropped */
    for (let py = y0; py < y1; py++) {
      const cyA = Math.max(0, Math.floor((py - oy) * inv)),
        cyB = Math.min(L, Math.ceil((py + 1 - oy) * inv));
      if (cyB <= cyA) continue;
      const out = (py - y0) * w - x0;
      for (let p = x0; p < x1; p++) {
        const cxA = Math.max(0, Math.floor((p - ox) * inv)),
          cxB = Math.min(L, Math.ceil((p + 1 - ox) * inv));
        if (cxB <= cxA) continue;
        let cnt = 0,
          tw = 0;
        for (let cy = cyA; cy < cyB; cy++) {
          const row = cy * L;
          for (let cx = cxA; cx < cxB; cx++) {
            const i = row + cx;
            const b = (mask[i >>> 5] >>> (i & 31)) & 1;
            cnt += b;
            if (b) tw += (twin[i >>> 5] >>> (i & 31)) & 1;
          }
        }
        if (cnt) px[out + p] = rampPx(shade(cnt / ((cyB - cyA) * (cxB - cxA))), tw / cnt);
      }
    }
    label = `exact density · ${inv.toFixed(1)} cells/px`;
  }
  ctx.putImageData(img, x0, y0);
  return label;
}

/* coarse regime: the mip whose texel is 1–2 device px, bilinear, culled */
function drawMip(ctx, canvas, cellPx, ox, oy) {
  if (!spiralLevels.length) return null;
  const need = 1 / cellPx; // cells per device pixel
  let k = 0;
  while (k < spiralLevels.length - 1 && spiralLevels[k].cell < need) k++;
  const lv = spiralLevels[k];
  const texPx = lv.cell * cellPx; // device px per texel, ≈ 1…2
  const sx0 = Math.max(0, Math.floor(-ox / texPx)),
    sy0 = Math.max(0, Math.floor(-oy / texPx)),
    sx1 = Math.min(lv.size, Math.ceil((canvas.width - ox) / texPx)),
    sy1 = Math.min(lv.size, Math.ceil((canvas.height - oy) / texPx));
  if (sx1 <= sx0 || sy1 <= sy0) return 'off screen';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    lv.canvas,
    sx0,
    sy0,
    sx1 - sx0,
    sy1 - sy0,
    ox + sx0 * texPx,
    oy + sy0 * texPx,
    (sx1 - sx0) * texPx,
    (sy1 - sy0) * texPx
  );
  ctx.imageSmoothingEnabled = false;
  return `density mip ${k} · ${lv.cell}×${lv.cell} cells/texel`;
}
/* ==================== hexagonal grid rendering ======================
      Screen ← axial is the linear map (device px):
        sx = ox + cellPx·(q + r/2 + R + 0.5)
        sy = oy + cellPx·√3/2·(r + R + 0.5)
      Its inverse (pixel → fractional axial) plus cube rounding gives the
      nearest hex, i.e. a crisp hexagonal Voronoi cell per prime.
      ==================================================================== */
function hexClip(canvas, cellPx, ox, oy) {
  const pad = cellPx; // hex corners poke ≈0.15 cell past the box
  const x0 = Math.max(0, Math.floor(ox - pad)),
    y0 = Math.max(0, Math.floor(oy - pad)),
    x1 = Math.min(canvas.width, Math.ceil(ox + spiralExtW * cellPx + pad)),
    y1 = Math.min(canvas.height, Math.ceil(oy + spiralExtH * cellPx + pad));
  return x1 <= x0 || y1 <= y0 ? null : { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function hexScatterBuffers(n) {
  if (!hexCounts || hexCounts.length < n) {
    hexCounts = new Uint32Array(n);
    hexTwins = new Uint32Array(n);
  } else {
    hexCounts.fill(0, 0, n);
    hexTwins.fill(0, 0, n);
  }
  return [hexCounts, hexTwins];
}
/* visit every prime hex whose centre lands inside the pixel rect — the
      scatter direction, so no cell can be missed however small it is */
function forEachVisibleHex(cellPx, ox, oy, x0, y0, x1, y1, hit) {
  const mask = spiralMask,
    twin = spiralTwin,
    D = spiralL,
    R = spiralR,
    pitch = cellPx * HEX_K;
  const rLo = Math.max(-R, Math.ceil((y0 - oy) / pitch - R - 0.5)),
    rHi = Math.min(R, Math.ceil((y1 - oy) / pitch - R - 0.5) - 1);
  for (let r = rLo; r <= rHi; r++) {
    const sy = Math.floor(oy + pitch * (r + R + 0.5));
    if (sy < y0 || sy >= y1) continue;
    const base = ox + cellPx * (r / 2 + R + 0.5); // screen x of q = 0
    const qLo = Math.max(-R, Math.ceil((x0 - base) / cellPx)),
      qHi = Math.min(R, Math.ceil((x1 - base) / cellPx) - 1);
    const row = (r + R) * D;
    for (let q = qLo; q <= qHi; q++) {
      const i = row + q + R;
      if ((mask[i >>> 5] >>> (i & 31)) & 1) {
        const sx = Math.floor(base + cellPx * q);
        if (sx >= x0 && sx < x1) hit(sx, sy, (twin[i >>> 5] >>> (i & 31)) & 1);
      }
    }
  }
}
/* cellPx ≥ 1: nearest-hex gather (filled hexagons) + scatter guarantee */
function drawHexExact(ctx, canvas, cellPx, ox, oy) {
  const c = hexClip(canvas, cellPx, ox, oy);
  if (!c) return 'off screen';
  const { x0, y0, x1, y1, w } = c;
  const img = viewportImageData(ctx, c.w, c.h);
  const px = new Uint32Array(img.data.buffer);
  px.fill(BG_PX);
  const mask = spiralMask,
    twin = spiralTwin,
    D = spiralL,
    R = spiralR,
    inv = 1 / cellPx;
  for (let py = y0; py < y1; py++) {
    const rf = ((py + 0.5 - oy) * inv) / HEX_K - (R + 0.5);
    let qf = (x0 + 0.5 - ox) * inv - (R + 0.5) - rf / 2;
    const out = (py - y0) * w - x0;
    for (let p = x0; p < x1; p++, qf += inv) {
      /* cube rounding: round q, r, s = −q−r and repair the worst one */
      let q = Math.round(qf),
        r = Math.round(rf);
      const s = Math.round(-qf - rf);
      if (q + r + s !== 0) {
        const dq = Math.abs(q - qf),
          dr = Math.abs(r - rf),
          ds = Math.abs(s + qf + rf);
        if (dq > dr && dq > ds) q = -r - s;
        else if (dr > ds) r = -q - s;
      }
      if (q < -R || q > R || r < -R || r > R) continue;
      const i = (r + R) * D + (q + R);
      if ((mask[i >>> 5] >>> (i & 31)) & 1)
        px[out + p] = (twin[i >>> 5] >>> (i & 31)) & 1 ? PX_TWIN : PX_PRIME;
    }
  }
  /* a hex has area √3/2 < 1, so near cellPx = 1 some contain no pixel
        centre; light their centre pixel explicitly — nothing is dropped */
  forEachVisibleHex(cellPx, ox, oy, x0, y0, x1, y1, (sx, sy, tw) => {
    px[(sy - y0) * w - x0 + sx] = tw ? PX_TWIN : PX_PRIME;
  });
  ctx.putImageData(img, x0, y0);
  return `exact hex · ${cellPx.toFixed(1)} px/cell`;
}
/* ½ ≤ cellPx < 1: exact density by scattering cell centres into pixels */
function drawHexDensity(ctx, canvas, cellPx, ox, oy) {
  const c = hexClip(canvas, cellPx, ox, oy);
  if (!c) return 'off screen';
  const { x0, y0, x1, y1, w, h } = c;
  const img = viewportImageData(ctx, w, h);
  const px = new Uint32Array(img.data.buffer);
  px.fill(BG_PX);
  const [counts, twins] = hexScatterBuffers(w * h);
  forEachVisibleHex(cellPx, ox, oy, x0, y0, x1, y1, (sx, sy, tw) => {
    const i = (sy - y0) * w - x0 + sx;
    counts[i]++;
    if (tw) twins[i]++;
  });
  const norm = HEX_K * cellPx * cellPx; // 1 / (hex cells per device pixel)
  const n = w * h;
  for (let i = 0; i < n; i++)
    if (counts[i]) px[i] = rampPx(shade(counts[i] * norm), twins[i] / counts[i]);
  ctx.putImageData(img, x0, y0);
  return `exact hex density · ${(1 / norm).toFixed(1)} cells/px`;
}
/* cellPx < ½: the axial density mip drawn through the hex shear matrix —
      a texel becomes a parallelogram of exactly one hex area per cell, so
      the bilinear blur is still an area-correct density plot */
function drawHexMip(ctx, canvas, cellPx, ox, oy) {
  if (!spiralLevels.length) return null;
  const need = 1 / cellPx;
  let k = 0;
  while (k < spiralLevels.length - 1 && spiralLevels[k].cell < need) k++;
  const lv = spiralLevels[k],
    cel = lv.cell,
    R = spiralR;
  const ma = cellPx * cel, // ∂screen.x / ∂texel.x
    mc = 0.5 * cellPx * cel, // ∂screen.x / ∂texel.y  (the shear)
    md = HEX_K * cellPx * cel, // ∂screen.y / ∂texel.y
    me = ox - cellPx * (R / 2 + 0.25),
    mf = oy;
  let t0 = Infinity,
    t1 = -Infinity,
    s0 = Infinity,
    s1 = -Infinity;
  for (const [X, Y] of [
    [0, 0],
    [canvas.width, 0],
    [0, canvas.height],
    [canvas.width, canvas.height],
  ]) {
    const s = (Y - mf) / md,
      t = (X - me - mc * s) / ma;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
    if (s < s0) s0 = s;
    if (s > s1) s1 = s;
  }
  const tx0 = Math.max(0, Math.floor(t0)),
    ty0 = Math.max(0, Math.floor(s0)),
    tx1 = Math.min(lv.size, Math.ceil(t1) + 1),
    ty1 = Math.min(lv.size, Math.ceil(s1) + 1);
  if (tx1 <= tx0 || ty1 <= ty0) return 'off screen';
  ctx.save();
  ctx.setTransform(ma, 0, mc, md, me, mf); // texel space → device px
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(lv.canvas, tx0, ty0, tx1 - tx0, ty1 - ty0, tx0, ty0, tx1 - tx0, ty1 - ty0);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  return `hex density mip ${k} · ${cel}×${cel} cells/texel`;
}

function drawHud(ctx, canvas, dpr, mode) {
  if (!mode) return;
  const hCss = canvas.height / dpr;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  const label = `${spiralLabel || `L = ${fmt(spiralL)}`} · ${mode}`;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(11,15,21,0.75)';
  ctx.fillRect(6, hCss - 23, tw + 12, 17);
  ctx.fillStyle = '#8b97a8';
  ctx.fillText(label, 12, hCss - 11);
  ctx.restore();
}
function tooltipEl() {
  return document.getElementById('spiralTooltip');
}
function hideSpiralTooltip() {
  const el = tooltipEl();
  if (el) el.style.display = 'none';
}
function spiralIntegerAt(clientX, clientY) {
  const canvas = spiralCanvas();
  if (!canvas || !spiralMask) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  if (mx < 0 || my < 0 || mx > rect.width || my > rect.height) return null;
  const dpr = window.devicePixelRatio || 1;
  const cellPx = spiralView.scale * dpr;
  const px = mx * dpr;
  const py = my * dpr;
  const ox = spiralView.tx * dpr;
  const oy = spiralView.ty * dpr;
  if (spiralMode === 'hex') {
    const R = spiralR;
    const inv = 1 / cellPx;
    const rd = ((py - oy) * inv) / HEX_K - (R + 0.5);
    const qd = (px - ox) * inv - (R + 0.5) - rd / 2;
    let q = Math.round(qd);
    let r = Math.round(rd);
    const s = Math.round(-qd - rd);
    if (q + r + s !== 0) {
      const dq = Math.abs(q - qd);
      const dr = Math.abs(r - rd);
      const ds = Math.abs(s + qd + rd);
      if (dq > dr && dq > ds) q = -r - s;
      else if (dr > ds) r = -q - s;
    }
    const k = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    const off = spiralOrigin - 1;
    if (k === 0) return 1 + off;
    if (k > R) return null;
    const base = 1 + 3 * (k - 1) * k;
    if (q === 1 && r === k - 1) return base + 1 + off;
    if (q + r === k && q >= 2 && q <= k) return base + q + off;
    if (q === k && r <= -1 && r >= -k) return base + k - r + off;
    if (r === -k && q >= 0 && q <= k - 1) return base + 3 * k - q + off;
    if (q + r === -k && q <= -1 && q >= -k) return base + 3 * k - q + off;
    if (q === -k && r >= 1 && r <= k) return base + 4 * k + r + off;
    if (r === k && q >= -k + 1 && q <= 0) return base + 6 * k + q + off;
    return null;
  }
  const L = spiralL;
  const gx = (px - ox) / cellPx;
  const gy = (py - oy) / cellPx;
  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  if (cx < 0 || cy < 0 || cx >= L || cy >= L) return null;
  const c = L >> 1;
  const dx = cx - c;
  const dy = cy - c;
  const r = Math.max(Math.abs(dx), Math.abs(dy));
  if (r === 0) return 1;
  const E = (2 * r + 1) * (2 * r + 1);
  let n;
  if (dy === r) n = E - (r - dx);
  else if (dx === -r) n = E - 2 * r - (r - dy);
  else if (dy === -r) n = E - 6 * r + (r - dx);
  else if (dx === r) n = E - 6 * r - (dy + r);
  else return null;
  if (n < 1 || n > spiralCells) return null;
  return n + spiralOrigin - 1;
}
const FACTOR_SUP = {
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
};
function formatExponent(e) {
  return String(e)
    .split('')
    .map((d) => FACTOR_SUP[d])
    .join('');
}
function factorCanonical(n, primesUpToN) {
  if (n <= 1) return String(n);
  let rem = n;
  const factors = [];
  if (primesUpToN) {
    for (const p of primesUpToN) {
      if (p * p > rem) break;
      if (rem % p === 0) {
        let e = 0;
        while (rem % p === 0) {
          rem /= p;
          e++;
        }
        factors.push([p, e]);
      }
    }
  } else {
    if (rem % 2 === 0) {
      let e = 0;
      while (rem % 2 === 0) {
        rem /= 2;
        e++;
      }
      factors.push([2, e]);
    }
    for (let p = 3; p * p <= rem; p += 2) {
      if (rem % p === 0) {
        let e = 0;
        while (rem % p === 0) {
          rem /= p;
          e++;
        }
        factors.push([p, e]);
      }
    }
  }
  if (rem > 1) factors.push([rem, 1]);
  return factors.map(([p, e]) => (e === 1 ? fmt(p) : `${fmt(p)}${formatExponent(e)}`)).join(' × ');
}

function moveSpiralTooltip(clientX, clientY) {
  const canvas = spiralCanvas();
  const el = tooltipEl();
  if (!canvas || !el) return;
  const n = spiralIntegerAt(clientX, clientY);
  if (n == null) {
    el.style.display = 'none';
    return;
  }
  const rect = canvas.getBoundingClientRect();
  el.textContent = `n = ${fmt(n)} = ${factorCanonical(n, lastSpiral && lastSpiral.primes)}`;
  el.style.display = 'block';
  let x = clientX - rect.left + 12;
  let y = clientY - rect.top + 12;
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  if (x + tw > rect.width - 4) x = Math.max(4, clientX - rect.left - tw - 8);
  if (y + th > rect.height - 4) y = Math.max(4, clientY - rect.top - th - 8);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function renderSpiral() {
  const canvas = spiralCanvas();
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const wCss = Math.max(1, rect.width);
  const hCss = Math.max(1, rect.height);
  if (canvas.width !== Math.round(wCss * dpr) || canvas.height !== Math.round(hCss * dpr)) {
    canvas.width = Math.round(wCss * dpr);
    canvas.height = Math.round(hCss * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); // work in device pixels
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0f15';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!spiralMask) return;
  const cellPx = spiralView.scale * dpr; // device px per spiral cell
  const ox = spiralView.tx * dpr, // device px of cell (0,0)
    oy = spiralView.ty * dpr;
  const mode =
    spiralMode === 'hex'
      ? cellPx >= 1
        ? drawHexExact(ctx, canvas, cellPx, ox, oy)
        : cellPx >= 0.5
          ? drawHexDensity(ctx, canvas, cellPx, ox, oy)
          : drawHexMip(ctx, canvas, cellPx, ox, oy)
      : cellPx >= 0.5
        ? drawExact(ctx, canvas, cellPx, ox, oy)
        : drawMip(ctx, canvas, cellPx, ox, oy);
  drawHud(ctx, canvas, dpr, mode);
}

function resetSpiralView() {
  const canvas = spiralCanvas();
  if (!canvas || !spiralMask) return;
  hideSpiralTooltip();
  const rect = canvas.getBoundingClientRect();
  const pad = 12;
  const gw = spiralExtW || spiralL,
    gh = spiralExtH || spiralL;
  const fit = Math.min((rect.width - pad * 2) / gw, (rect.height - pad * 2) / gh);
  spiralView.scale = Math.max(1e-4, fit);
  spiralView.min = spiralView.scale / 4; // allow zooming a bit past "fit"
  spiralView.tx = (rect.width - gw * spiralView.scale) / 2;
  spiralView.ty = (rect.height - gh * spiralView.scale) / 2;
  renderSpiral();
}

async function drawUlamSpiral() {
  const info = document.getElementById('spiralInfo');
  const Ninput = Math.max(10, +$('limit').value | 0);
  const w = Math.max(1, Math.min(7, +$('w').value | 0));
  const grid = $('spiralGrid').value === 'hex' ? 'hex' : 'square';
  const origin = Math.max(0, Math.min(3, +$('spiralOrigin').value | 0));
  /* the walk numbers its cells origin … origin+cells−1, so the truncation
       offset eats into the cell budget that still fits below N */
  const budget = Math.max(4, Ninput - origin + 1);
  let L = 0,
    R = 0,
    Nspiral = 0,
    cells = 0;
  if (grid === 'hex') {
    /* largest R with H_R = 1 + 3R(R+1) ≤ budget (sqrt then integer repair) */
    R = Math.max(0, Math.floor((Math.sqrt(12 * budget - 3) - 3) / 6));
    while (1 + 3 * (R + 1) * (R + 2) <= budget) R++;
    while (R > 0 && 1 + 3 * R * (R + 1) > budget) R--;
    if (R > MAX_RING) R = MAX_RING;
    if (R < 1) {
      info.textContent = 'N too small for a hex spiral.';
      return;
    }
    cells = 1 + 3 * R * (R + 1);
    Nspiral = origin + cells - 1; // largest n on the plot
  } else {
    L = Math.floor(Math.sqrt(budget));
    if (L > MAX_SIDE) L = MAX_SIDE;
    if (L < 2) {
      info.textContent = 'N too small for a Ulam spiral.';
      return;
    }
    cells = L * L; // the spiral can only ever show L² integers
    Nspiral = origin + cells - 1;
  }
  /* +2: the prime on the last cell still needs its twin partner to exist */
  const need = Nspiral + 2;
  let primes;
  if (lastSpiral && lastSpiral.N >= need) {
    primes = lastSpiral.primes; // the output is algorithm-independent
  } else {
    const algo = currentAlgo();
    info.textContent = `generating primes ≤ ${fmt(need)} with Algorithm ${algo.meta.id}…`;
    await sleep(0);
    const res = algo.run(need, { w });
    primes = res.primes;
    lastSpiral = { primes, N: need };
  }
  info.textContent = `walking the ${grid} spiral (${fmt(cells)} cells)…`;
  await sleep(0);
  spiralMode = grid;
  let built;
  if (grid === 'hex') {
    spiralR = R;
    spiralL = 2 * R + 1; // axial box side
    built = buildHexMask(primes, R, origin);
  } else {
    spiralR = 0;
    spiralL = L;
    built = buildSpiralMask(primes, L, origin);
  }
  spiralMask = built.mask;
  spiralTwin = built.twin;
  info.textContent = 'building density mip pyramid…';
  await sleep(0);
  spiralLevels = buildSpiralLevels(spiralMask, spiralTwin, spiralL);
  resetSpiralView();
  info.textContent =
    `${fmt(spiralCount)} primes · ` +
    (grid === 'hex' ? `${fmt(R)} rings (axial box ${fmt(spiralL)}²) · ` : `side ${fmt(L)} · `) +
    `n ∈ [${fmt(spiralOrigin)}, ${fmt(spiralLast)}] · ` +
    `${spiralLevels.length} density levels (base ${spiralLevels[0].cell}×${spiralLevels[0].cell}) · ` +
    `twins in red · drag to pan, wheel to zoom`;
}

function initSpiralInteractions() {
  const canvas = spiralCanvas();
  if (!canvas) return;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    hideSpiralTooltip();
    canvas.classList.add('dragging');
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) {
      moveSpiralTooltip(e.clientX, e.clientY);
      return;
    }
    hideSpiralTooltip();
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    spiralView.tx += dx;
    spiralView.ty += dy;
    scheduleRender(); // coalesce to one draw per frame
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.classList.remove('dragging');
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointerleave', () => {
    hideSpiralTooltip();
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.pow(1.0015, -e.deltaY);
      const oldScale = spiralView.scale;
      spiralView.scale = Math.max(spiralView.min, Math.min(400, oldScale * factor));
      const sx = mx - spiralView.tx;
      const sy = my - spiralView.ty;
      const nx = sx * (spiralView.scale / oldScale);
      const ny = sy * (spiralView.scale / oldScale);
      spiralView.tx = mx - nx;
      spiralView.ty = my - ny;
      scheduleRender();
    },
    { passive: false }
  );
  window.addEventListener('resize', () => {
    if (spiralMask) resetSpiralView();
  });
}

/* =====================================================================
minimal UI
===================================================================== */
const $ = (id) => document.getElementById(id);
const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const openLog = () => {
  const d = $('outWrap');
  if (d) d.open = true; // never write into a collapsed panel silently
};
const fmt = (n) =>
  typeof n === 'number' && isFinite(n)
    ? Number.isInteger(n)
      ? n.toLocaleString('en-US')
      : n.toFixed(4)
    : String(n);

function panel(id) {
  const el = $(id);
  return {
    clear() {
      el.innerHTML = '';
      el.classList.remove('dim');
    },
    line(text = '', cls) {
      const s = document.createElement('span');
      if (cls) s.className = cls;
      s.textContent = text + '\n';
      el.appendChild(s);
    },
    head(t) {
      this.line(t, 'head');
    },
    dim(t) {
      this.line(t, 'dim');
    },
  };
}

async function generate() {
  const P = panel('out'),
    badge = $('badge');
  P.clear();
  openLog();
  badge.innerHTML = '';
  const algo = currentAlgo();
  const N = Math.max(10, +$('limit').value | 0);
  const w = Math.max(1, Math.min(7, +$('w').value | 0));
  P.head(`${algo.meta.title}   [${algo.meta.ref}]`);
  P.line(`N = ${fmt(N)}${algo.meta.usesWheel ? `   w = ${w}` : '   (no wheel)'}`);
  await sleep(0);

  const res = algo.run(N, { w });
  const { primes, stats: st } = res;
  lastSpiral = { primes, N };

  P.line('');
  P.line(`primes emitted   : ${fmt(primes.length)}   (last = ${fmt(primes[primes.length - 1])})`);
  P.line(`first primes     : ${primes.slice(0, 15).join(' ')} …`);
  P.line(
    `time             : ${st.ms.toFixed(1)} ms   ` +
      `(${(N / st.ms / 1000).toFixed(2)} M integers/s, binary heap)`
  );
  P.line('');
  /* algorithm-specific report lives with the algorithm */
  for (const [text, cls] of algo.summary(res, N)) P.line(text, cls);

  if ($('verify').checked && N <= 3_000_000) {
    await sleep(0);
    const ref = sieveRef(N);
    const ok = ref.length === primes.length && ref.every((v, i) => v === primes[i]);
    P.line('');
    P.line(
      `vs Eratosthenes  : ${ok ? 'identical, ' + fmt(ref.length) + ' primes' : 'MISMATCH'}`,
      ok ? 'pass' : 'fail'
    );
    badge.innerHTML = ok
      ? '<span class="badge">verified</span>'
      : '<span class="badge bad">mismatch</span>';
  } else if ($('verify').checked) {
    P.line('');
    P.dim('verification skipped (N > 3·10⁶)');
  }
}

function firstPrimes() {
  const P = panel('out');
  $('badge').innerHTML = '';
  P.clear();
  openLog();
  const algo = currentAlgo();
  const w = Math.max(1, Math.min(7, +$('w').value | 0));
  P.head(
    `first 50 primes from the unbounded generator ` +
      `${algo.meta.id}.stream(${algo.meta.usesWheel ? `{ w: ${w} }` : '{}'})`
  );
  const g = algo.stream({ w }),
    got = [];
  for (let i = 0; i < 50; i++) got.push(g.next().value);
  P.line(got.join(' '));
  P.line('');
  const ref = sieveRef(300);
  const ok = got.every((v, i) => v === ref[i]);
  P.line(`vs Eratosthenes : ${ok ? 'identical' : 'MISMATCH'}`, ok ? 'pass' : 'fail');
  P.dim(algo.meta.streamNote);
}
function syncAlgo() {
  const algo = currentAlgo();
  $('algoNote').textContent = `${algo.meta.ref} — ${algo.meta.blurb}`;
  $('w').disabled = !algo.meta.usesWheel;
  $('w').title = algo.meta.usesWheel ? '' : 'Algorithm A uses no wheel';
}

$('btnRun').onclick = () => generate();
$('btnFirst').onclick = firstPrimes;
$('btnSpiral').onclick = () => drawUlamSpiral();
$('btnSpiralReset').onclick = () => resetSpiralView();
$('algo').onchange = () => {
  syncAlgo();
  firstPrimes(); // cheap, and shows the selected module actually running
};
$('spiralGrid').onchange = () => {
  if (spiralMask) drawUlamSpiral(); // re-walk with the other geometry
};
$('spiralOrigin').onchange = () => {
  if (spiralMask) drawUlamSpiral(); // re-walk from the new origin
};
initSpiralInteractions();
syncAlgo();

firstPrimes(); /* cheap initial render */
