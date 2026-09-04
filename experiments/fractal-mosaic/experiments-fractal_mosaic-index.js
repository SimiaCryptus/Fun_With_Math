'use strict';

/* ==========================================================================
 * 0. Configuration
 * ======================================================================== */

const CFG = {
  assetsBase: 'assets/',
  // --- subtile iteration (all live-editable from the HUD) -----------------
  // Partition granularity: CSS px each *sub-image* reaches before its parent
  // dissolves. Small values = denser mosaics (and many more quads).
  tilePx: 40,
  // LOD floor: a tile is never subdivided if its children would land below
  // this on-screen size. This is what keeps a fine partition affordable.
  minTilePx: 12,
  fadeSpan: 2.0, // tile grows by this factor across the cross-fade
  jitter: 0.5, // per-tile randomisation of the dissolve threshold (0 = uniform)
  // Default mosaic: 256×256 = 65 536 sub-images per photo. That is far more
  // work than one frame can do, which is exactly why the subdivision builder
  // below is incremental (see World.pumpBuild + the "calculating" splash).
  radix: 256, // 0 → mixed per level (radixChoices); >= 2 → fixed N×N mosaic
  // A 2–4 grid can only ever restate a photo as a 2×2..4×4 *pixel* image —
  // that is the "blurred copy" artefact, not a mosaic. Start at a grid that
  // actually carries the parent's shape.
  radixChoices: [6, 8, 9, 12],
  autoPreset: 3,
  maxRadix: 512, // 24×24 = 576 sub-images per photo
  // ------------------------------------------------------------------------
  maxQuads: 14000, // per-frame quad budget; the adaptive LOD converges on it
  maxStartTiles: 900, // cap on top-of-walk tiles
  textureBudget: 460, // resident GPU textures
  maxConcurrentLoads: 10,
  candidateK: 28, // ANN candidate pool per subcell
  topPick: 5, // stochastic choice among best candidates
  pickBias: 1.8, // >1 biases toward the best match
  // Depth is no longer a resource: a tile is (photoIdx, level) and its
  // children come from a cached per-photo decomposition, so nothing in the
  // recursion grows with depth. 4096 levels is ~6^4096 magnification.
  maxLevel: 4096,
  // Cached photo decompositions (keyed by photo × grid size).
  decompCacheMax: 20000,
  // Layout seed. Same seed ⇒ byte-identical infinite fractal.
  seed: 'mosaic-1',
  structure: 0.6, // weight of the (contrast-relative) 2x2 match vs mean color
  diversity: 0.55,
  // Per-tile colour correction toward the region the sub-image replaces.
  tint: 0.4,
  // Resolution of the per-photo target field learned lazily from decoded
  // mips. This is what lets a mosaic be finer than the build-time index.
  // Since region targets are now exact box averages (no interpolation), this
  // resolution *is* the sharpness ceiling of the reconstruction.
  //
  // `detailGrid` is only the *baseline*: a photo that is being split into
  // r×r asks for a ~2r field, so the reconstruction is limited by the
  // photo's own pixels rather than by a fixed grid. Without this a 512×512
  // mosaic was laid out over a 48×48 target and every ~11×11 block of
  // sub-images inherited one colour — the parent looked pixelated before it
  // dissolved.
  detailGrid: 48,
  maxDetailGrid: 512, // ceiling; the real limit is the decoded mip itself
  detailCellBudget: 3000000, // resident target-field cells (×3 floats)
  detailPhotos: 64, // and a hard cap on how many photos hold one
  decompCellBudget: 4000000, // resident decomposition cells (kid/bias/tint)
  // ---- incremental subdivision builder -----------------------------------
  buildSyncCells: 1024, // mosaics this small are finished inline (no splash)
  buildMsPerFrame: 6, // background build slice while browsing
  batchMsPerFrame: 22, // build slice while "Precalc all" is running
  buildSplashCells: 2048, // show the splash above this much pending work
  maxBuildJobs: 3, // concurrent background decompositions
};

/** Named "mixed" schemes for the per-level mosaic grid size. */
const AUTO_PRESETS = [
  { label: 'Auto — mixed 2–4 (4–16 tiles)', choices: [2, 3, 3, 4] },
  { label: 'Auto — mixed 3–5 (9–25 tiles)', choices: [3, 4, 4, 5] },
  { label: 'Auto — mixed 4–8 (16–64 tiles)', choices: [4, 5, 6, 8] },
  { label: 'Auto — mixed 6–12 (36–144 tiles)', choices: [6, 8, 9, 12] },
  { label: 'Auto — mixed 8–16 (64–256 tiles)', choices: [8, 10, 12, 16] },
  { label: 'Auto — mixed 16–32 (256–1k tiles)', choices: [16, 20, 25, 32] },
  { label: 'Auto — mixed 64–256 (4k–65k tiles)', choices: [64, 102, 161, 256] },
];
/**
 * Selectable mosaic grid sizes. Successive entries differ by a factor of
 * 2^(1/3) — three steps per doubling (… 64, 81, 102, 128 …) — so the whole
 * 2…512 range is ~25 evenly-spaced choices instead of 511 useless ones, and
 * every third click doubles the linear grid (8× the sub-images).
 */
const GRID_STEPS = (() => {
  const out = [];
  const max = Math.max(2, CFG.maxRadix | 0);
  for (let k = 3; ; k++) {
    const n = Math.round(Math.pow(2, k / 3));
    if (n > max) break;
    if (out[out.length - 1] !== n) out.push(n);
  }
  return out;
})();

/** Accepts "auto:<k>" or a plain grid size; writes CFG.radix / radixChoices. */
function setGrid(v) {
  const s = String(v);
  if (s.startsWith('auto')) {
    const k = Math.min(Math.max(parseInt(s.slice(5), 10) || 0, 0), AUTO_PRESETS.length - 1);
    CFG.autoPreset = k;
    CFG.radixChoices = AUTO_PRESETS[k].choices;
    CFG.radix = 0;
  } else {
    const n = parseInt(s, 10);
    CFG.radix = Number.isFinite(n) ? Math.min(Math.max(n, 2), CFG.maxRadix) : 0;
  }
}

const gridValue = () => (CFG.radix >= 2 ? String(CFG.radix) : 'auto:' + CFG.autoPreset);
const gridLabel = () =>
  CFG.radix >= 2
    ? `${CFG.radix}×${CFG.radix} — ${CFG.radix * CFG.radix} sub-images per photo`
    : AUTO_PRESETS[CFG.autoPreset].label;

/* ==========================================================================
 * 1. utils — hashing, deterministic PRNG, math, color
 * ======================================================================== */

function mix32(a, b) {
  let h = (a ^ Math.imul(b ^ (b >>> 15), 0x2c1b3c6d)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, fully deterministic. */
function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);

function labToRgb(L, A, B) {
  const fy = (L + 16) / 116,
    fx = fy + A / 500,
    fz = fy - B / 200;
  const inv = (t) => (t * t * t > 0.008856451679 ? t * t * t : (t - 16 / 116) / 7.787037037);
  const X = 0.95047 * inv(fx),
    Y = 1.0 * inv(fy),
    Z = 1.08883 * inv(fz);
  let r = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  let g = X * -0.969266 + Y * 1.8760108 + Z * 0.041556;
  let b = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;
  const enc = (c) => {
    c = clamp(c, 0, 1);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  return [enc(r), enc(g), enc(b)];
}

const SRGB_LIN = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    t[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return t;
})();

function linearRgbToLab(r, g, b, out, off) {
  const X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const Y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const Z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  const f = (t) => (t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 16 / 116);
  const fx = f(X / 0.95047),
    fy = f(Y),
    fz = f(Z / 1.08883);
  out[off] = 116 * fy - 16;
  out[off + 1] = 500 * (fx - fy);
  out[off + 2] = 200 * (fy - fz);
}

/** Grid signature from any drawable, computed on a scratch canvas. */
const sigCanvas = document.createElement('canvas');
const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true });

function signatureFromDrawable(drawable, G, maxS = 1024) {
  // Supersample each cell when we can afford to (small G), but never blow
  // past `maxS`: a 512×512 target field would otherwise want a 2048×2048
  // readback. `bs` is always an integer number of pixels per cell.
  const bs = Math.max(1, Math.min(4, Math.floor(maxS / G) || 1));
  const S = G * bs;
  sigCanvas.width = S;
  sigCanvas.height = S;
  sigCtx.clearRect(0, 0, S, S);
  sigCtx.imageSmoothingEnabled = true;
  sigCtx.imageSmoothingQuality = 'high';
  drawCover(sigCtx, drawable, S);
  const px = sigCtx.getImageData(0, 0, S, S).data;
  const grid = new Float32Array(G * G * 3);
  for (let gy = 0; gy < G; gy++)
    for (let gx = 0; gx < G; gx++) {
      let lr = 0,
        lg = 0,
        lb = 0,
        n = 0;
      for (let y = gy * bs; y < (gy + 1) * bs; y++) {
        let o = (y * S + gx * bs) * 4;
        for (let x = 0; x < bs; x++, o += 4) {
          lr += SRGB_LIN[px[o]];
          lg += SRGB_LIN[px[o + 1]];
          lb += SRGB_LIN[px[o + 2]];
          n++;
        }
      }
      linearRgbToLab(lr / n, lg / n, lb / n, grid, (gy * G + gx) * 3);
    }
  return grid;
}

/** Center-cropped "cover" draw of an arbitrary source into a square. */
function drawCover(ctx, src, size) {
  const sw = src.width || src.videoWidth,
    sh = src.height || src.videoHeight;
  const s = Math.min(sw, sh);
  ctx.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, size, size);
}

/* ==========================================================================
 * 2. album — photo table, mip sources, region descriptors
 * ======================================================================== */

const IDENT_UV = new Float32Array([0, 0, 1, 1]);

/**
 * UV rect that centre-crops a (possibly non-square) texture into the square
 * a tile occupies. Returning IDENT_UV for square sources keeps the common
 * case allocation-free.
 */
function coverUV(w, h) {
  if (!w || !h || w === h) return IDENT_UV;
  const a = w / h;
  return a > 1
    ? new Float32Array([(1 - 1 / a) / 2, 0, 1 / a, 1])
    : new Float32Array([0, (1 - a) / 2, 1, a]);
}

/** Scratch for one CIELAB sample (single-threaded, never re-entered). */
const scratchLab = new Float32Array(3);

class Album {
  constructor(o) {
    this.name = o.name || 'album';
    this.n = o.n;
    this.ids = o.ids;
    this.gridSize = o.gridSize;
    this.grid = o.grid; // Float32Array n * G*G*3 (CIELAB)
    this.mipSizes = o.mipSizes; // ascending px sizes
    this.getSource = o.getSource; // (i, mip) -> {url, crop} | {canvas}
    this.atlasSource = o.atlasSource || null; // {url}|{canvas}
    this.atlasUV = o.atlasUV || null; // Float32Array n*4
    this.aspect = o.aspect || null;
    this.seedNum = o.seedNum >>> 0;
    this.heroIdx = o.heroIdx != null ? o.heroIdx : -1;
    this.feat = new Float32Array(this.n * 15); // mean(3) + 2x2 quad(12)
    this._rgb = new Float32Array(this.n * 3);
    // Per-photo high-resolution target fields, learned from decoded mips.
    // Cached tile picks record the field resolution they were built from,
    // so eviction can never silently downgrade an existing mosaic.
    this.detail = new Map();
    this.detailWant = new Int32Array(this.n); // resolution the walk asked for
    this.detailCap = new Int32Array(this.n); // best the source can give (0 = unknown)
    this._detailQ = [];
    this._detailCells = 0;
    this._needQ = [];
    this._needSet = new Set();
    this._buildFeatures();
    this._buildRgb();
  }

  _buildRgb() {
    for (let i = 0; i < this.n; i++) {
      const c = labToRgb(this.feat[i * 15], this.feat[i * 15 + 1], this.feat[i * 15 + 2]);
      this._rgb[i * 3] = c[0];
      this._rgb[i * 3 + 1] = c[1];
      this._rgb[i * 3 + 2] = c[2];
    }
  }

  _buildFeatures() {
    for (let i = 0; i < this.n; i++) {
      const o = i * 15;
      this.sampleRegion(i, 0, 0, 1, 1, this.feat, o);
      this.sampleRegion(i, 0, 0, 0.5, 0.5, this.feat, o + 3);
      this.sampleRegion(i, 0.5, 0, 1, 0.5, this.feat, o + 6);
      this.sampleRegion(i, 0, 0.5, 0.5, 1, this.feat, o + 9);
      this.sampleRegion(i, 0.5, 0.5, 1, 1, this.feat, o + 12);
      // Store the quadrants *relative to the mean*: matching then compares
      // internal contrast instead of absolute colour, which is what makes
      // an edge in the target survive as an edge in the mosaic.
      for (let k = 3; k < 15; k++) this.feat[o + k] -= this.feat[o + (k % 3)];
    }
  }

  /**
   * Exact area-weighted mean of a signature field over a normalised region.
   *
   * Every cell of the field is itself a box filter of real pixels, so the
   * mean colour of an arbitrary rectangle is *exactly* the overlap-area
   * weighted sum of the cells it touches. Nothing is interpolated.
   *
   * This replaced a bilinear reconstruction, which sampled cell centres and
   * therefore bled each cell's colour halfway into its neighbours: a hard
   * boundary between two solid regions turned into a ramp in the target
   * field *before* a single sub-image was chosen, so the mosaic could only
   * ever reproduce a blurred version of the parent. Box averaging keeps a
   * sub-tile that lies wholly inside a solid region on that region's exact
   * colour, and only sub-tiles that genuinely straddle the edge get a mix
   * (in the correct proportion).
   */
  _boxAvg(g, base, G, x0, y0, x1, y1, out) {
    if (x1 < x0) {
      const t = x0;
      x0 = x1;
      x1 = t;
    }
    if (y1 < y0) {
      const t = y0;
      y0 = y1;
      y1 = t;
    }
    x0 = clamp(x0, 0, 1);
    x1 = clamp(x1, 0, 1);
    y0 = clamp(y0, 0, 1);
    y1 = clamp(y1, 0, 1);
    const gx0 = clamp(Math.floor(x0 * G), 0, G - 1),
      gy0 = clamp(Math.floor(y0 * G), 0, G - 1);
    const gx1 = clamp(Math.ceil(x1 * G) - 1, gx0, G - 1),
      gy1 = clamp(Math.ceil(y1 * G) - 1, gy0, G - 1);
    let L = 0,
      A = 0,
      B = 0,
      W = 0;
    for (let gy = gy0; gy <= gy1; gy++) {
      const oy = Math.min(y1, (gy + 1) / G) - Math.max(y0, gy / G);
      if (oy <= 0) continue;
      const row = base + gy * G * 3;
      for (let gx = gx0; gx <= gx1; gx++) {
        const ox = Math.min(x1, (gx + 1) / G) - Math.max(x0, gx / G);
        if (ox <= 0) continue;
        const w = ox * oy,
          p = row + gx * 3;
        L += g[p] * w;
        A += g[p + 1] * w;
        B += g[p + 2] * w;
        W += w;
      }
    }
    if (W > 0) {
      out[0] = L / W;
      out[1] = A / W;
      out[2] = B / W;
      return;
    }
    // Degenerate (zero-area) region: take the cell containing its centre.
    const cx = clamp(Math.floor(((x0 + x1) / 2) * G), 0, G - 1),
      cy = clamp(Math.floor(((y0 + y1) / 2) * G), 0, G - 1);
    const p = base + (cy * G + cx) * 3;
    out[0] = g[p];
    out[1] = g[p + 1];
    out[2] = g[p + 2];
  }

  /**
   * Mean colour of photo `i` over a normalised region — the one and only
   * quantity a sub-image is matched against.
   */
  sampleRegion(i, x0, y0, x1, y1, out, off) {
    // A photo that has been seen large enough to be subdivided owns a
    // high-resolution field derived from its own pixels; everything else
    // falls back to the album-wide (necessarily coarse) build-time index.
    const d = this.detail.get(i);
    const G = d ? d.G : this.gridSize,
      g = d ? d.grid : this.grid,
      base = d ? 0 : i * G * G * 3;
    this._boxAvg(g, base, G, x0, y0, x1, y1, scratchLab);
    out[off] = scratchLab[0];
    out[off + 1] = scratchLab[1];
    out[off + 2] = scratchLab[2];
  }

  /** Target descriptor (15 floats) for a sub-region of photo `i`. */
  descriptor(i, x0, y0, x1, y1, out) {
    const mx = (x0 + x1) / 2,
      my = (y0 + y1) / 2;
    this.sampleRegion(i, x0, y0, x1, y1, out, 0);
    this.sampleRegion(i, x0, y0, mx, my, out, 3);
    this.sampleRegion(i, mx, y0, x1, my, out, 6);
    this.sampleRegion(i, x0, my, mx, y1, out, 9);
    this.sampleRegion(i, mx, my, x1, y1, out, 12);
    for (let k = 3; k < 15; k++) out[k] -= out[k % 3];
    return out;
  }
  /** Current target-field resolution for photo `i` (cells per side). */
  detailRes(i) {
    const d = this.detail.get(i);
    return d ? d.G : this.gridSize;
  }

  /** Best resolution this photo's source pixels can ever give (0 = unknown). */
  detailCapOf(i) {
    return this.detailCap[i] | 0;
  }

  /**
   * Declare that photo `i` is about to be partitioned finely enough to need a
   * G×G target field, and queue a full-resolution decode if we do not have
   * one. Cheap enough to call for every dissolving tile, every frame.
   */
  wantDetail(i, G) {
    const ceil = clamp(CFG.maxDetailGrid | 0, 8, 2048);
    G = clamp(G | 0, 8, ceil);
    const lim = this.detailCap[i];
    if (lim) G = Math.min(G, lim); // never ask for detail the pixels lack
    if (G <= this.gridSize) return;
    const have = this.detail.get(i);
    if (have && have.G >= G) return;
    if (this.detailWant[i] < G) this.detailWant[i] = G;
    if (!this._needSet.has(i) && this._needQ.length < 64) {
      this._needSet.add(i);
      this._needQ.push(i);
    }
  }

  /** Next photo whose target field is still too coarse (-1 when none). */
  nextDetailNeed() {
    while (this._needQ.length) {
      const i = this._needQ.shift();
      this._needSet.delete(i);
      const have = this.detail.get(i);
      if (!have || have.G < (this.detailWant[i] | 0)) return i;
    }
    return -1;
  }

  /** The source could not be read — pin the ceiling so we stop retrying. */
  failDetail(i) {
    const have = this.detail.get(i);
    this.detailCap[i] = Math.max(1, have ? have.G : this.gridSize);
  }

  /** Bound the resident target fields by *cells* (a 512² field is 3 MB). */
  _evictDetail(keep) {
    const maxCells = Math.max(1 << 16, CFG.detailCellBudget | 0);
    const maxN = Math.max(4, CFG.detailPhotos | 0);
    let guard = this._detailQ.length + 1;
    while (
      guard-- > 0 &&
      this._detailQ.length &&
      (this._detailCells > maxCells || this.detail.size > maxN)
    ) {
      const j = this._detailQ.shift();
      if (j === keep) {
        this._detailQ.push(j);
        continue;
      }
      const e = this.detail.get(j);
      if (!e) continue;
      this._detailCells -= e.G * e.G;
      this.detail.delete(j);
    }
  }

  /**
   * Learn a high-resolution target field for one photo from a decoded mip.
   *
   * The build-time index is a single G×G (typically 8×8) grid per photo. Any
   * mosaic finer than that reads *sub-cell* targets, so entire blocks of
   * sub-tiles receive the same colour and the mosaic collapses into a G×G
   * pixelation of the parent — the "blurred copy" artefact. The pixels needed
   * to do better are already on the machine: the mip that is being displayed.
   * Only photos large enough to be subdivided ever reach this path.
   *
   * The resolution is driven by what the partition asked for (`detailWant`,
   * ~2× the mosaic grid) and clamped by the *actual* pixels of `drawable`, so
   * a 512×512 mosaic gets a 512-cell target field instead of a 48-cell one.
   * `full` marks the dedicated top-mip decode: only that one is allowed to
   * declare the source's ceiling.
   */
  learnDetail(i, drawable, full) {
    const ceil = clamp(CFG.maxDetailGrid | 0, 8, 2048);
    const w = drawable.width || drawable.naturalWidth || drawable.videoWidth || 0;
    const h = drawable.height || drawable.naturalHeight || drawable.videoHeight || 0;
    const srcPx = Math.min(w, h) | 0;
    // The dedicated top-mip decode pins the ceiling *before* any early exit:
    // a source too small to yield a field must still stop being re-requested
    // (wantDetail clamps to the cap and gives up once it is <= gridSize).
    if (full) this.detailCap[i] = Math.max(1, Math.min(srcPx, ceil));
    if (srcPx < 16) return false;
    const want = Math.max(CFG.detailGrid | 0, this.detailWant[i] | 0);
    const G = clamp(Math.min(want, srcPx, ceil), 8, ceil);
    const have = this.detail.get(i);
    if ((have && have.G >= G) || G <= this.gridSize) return false;
    let grid;
    try {
      grid = signatureFromDrawable(drawable, G);
    } catch (e) {
      return false; // tainted canvas
    }
    if (have) this._detailCells -= have.G * have.G;
    this.detail.set(i, { G, grid });
    this._detailCells += G * G;
    this._detailQ.push(i);
    this._evictDetail(i);
    return true;
  }

  mipFor(px) {
    const s = this.mipSizes;
    for (let i = 0; i < s.length; i++) if (s[i] >= px) return i;
    return s.length - 1;
  }

  rgbOf(i) {
    return this._rgb.subarray(i * 3, i * 3 + 3);
  }

  label(i) {
    return this.ids[i];
  }

  /**
   * Upgrade the signature grid from the packed thumbnail atlas.
   *
   * The build-time index is only G×G (4 or 8) per photo, which caps how
   * finely a photo can be partitioned before neighbouring sub-tiles start
   * sharing a target colour. The atlas cells are real square crops at
   * `mipSizes[0]` px, so once it has decoded we can recompute the grid at
   * ~cell/2 resolution for free — no extra network traffic.
   *
   * Returns true if the album was actually refined (caller must then
   * rebuild the colour index and invalidate the tile cache).
   */
  refineFromAtlas(drawable) {
    if (this._refined || !this.atlasUV || !drawable) return false;
    const aw = drawable.width || drawable.naturalWidth || 0,
      ah = drawable.height || drawable.naturalHeight || 0;
    if (!aw || !ah) return false;
    const cellPx = Math.min(this.atlasUV[2] * aw, this.atlasUV[3] * ah);
    // One grid cell per atlas pixel: the cell *is* a box-filtered crop, so
    // there is nothing to gain by averaging further — and the old
    // `cellPx / 2` rule made this whole refinement a no-op for 16px cells
    // (7 <= gridSize 8), which is why the target field stayed at 8×8.
    const G = clamp(Math.floor(cellPx), 2, 24);
    if (G <= this.gridSize) return false;
    let px;
    try {
      const cv = document.createElement('canvas');
      cv.width = aw;
      cv.height = ah;
      const cx2 = cv.getContext('2d', { willReadFrequently: true });
      cx2.drawImage(drawable, 0, 0);
      px = cx2.getImageData(0, 0, aw, ah).data;
    } catch (e) {
      return false; // tainted canvas (cross-origin atlas) — keep the coarse grid
    }
    const grid = new Float32Array(this.n * G * G * 3);
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      const rx = this.atlasUV[o] * aw,
        ry = this.atlasUV[o + 1] * ah,
        rw = this.atlasUV[o + 2] * aw,
        rh = this.atlasUV[o + 3] * ah;
      for (let gy = 0; gy < G; gy++) {
        const sy0 = Math.floor(ry + (gy * rh) / G);
        const sy1 = Math.max(sy0 + 1, Math.ceil(ry + ((gy + 1) * rh) / G));
        for (let gx = 0; gx < G; gx++) {
          const sx0 = Math.floor(rx + (gx * rw) / G);
          const sx1 = Math.max(sx0 + 1, Math.ceil(rx + ((gx + 1) * rw) / G));
          let lr = 0,
            lg = 0,
            lb = 0,
            n = 0;
          for (let y = sy0; y < sy1; y++) {
            if (y < 0 || y >= ah) continue;
            for (let x = sx0; x < sx1; x++) {
              if (x < 0 || x >= aw) continue;
              const p = (y * aw + x) * 4;
              lr += SRGB_LIN[px[p]];
              lg += SRGB_LIN[px[p + 1]];
              lb += SRGB_LIN[px[p + 2]];
              n++;
            }
          }
          if (!n) n = 1;
          linearRgbToLab(lr / n, lg / n, lb / n, grid, (i * G * G + gy * G + gx) * 3);
        }
      }
    }
    this.grid = grid;
    this.gridSize = G;
    this._refined = true;
    this._buildFeatures();
    this._buildRgb();
    return true;
  }
}

/** Weighted feature distance in CIELAB (mean + contrast-relative 2x2). */
function featDist(album, idx, desc, structW) {
  const f = album.feat,
    o = idx * 15;
  let dm = 0;
  for (let k = 0; k < 3; k++) {
    const d = f[o + k] - desc[k];
    dm += d * d;
  }
  let dq = 0;
  for (let k = 3; k < 15; k++) {
    const d = f[o + k] - desc[k];
    dq += d * d;
  }
  // Both sides are stored as (quadrant - mean), so this is a genuine
  // "does the sub-image have the same internal contrast" test rather than a
  // second, weaker copy of the mean test.
  // `structW` fades the term out when the target field is too coarse to
  // resolve a sub-cell's own 2×2 — otherwise the (identically zero) target
  // quads would systematically prefer flat photos.
  const sw = structW === undefined ? CFG.structure : structW;
  return dm + sw * (dq * 0.5);
}

/* ==========================================================================
 * 3. index — bucketed nearest-neighbour index over CIELAB means
 * ======================================================================== */

class ColorIndex {
  constructor(album, bins = 10) {
    this.album = album;
    this.bins = bins;
    this.buckets = new Map();
    for (let i = 0; i < album.n; i++) {
      const k = this._key(album.feat[i * 15], album.feat[i * 15 + 1], album.feat[i * 15 + 2]);
      let arr = this.buckets.get(k);
      if (!arr) {
        arr = [];
        this.buckets.set(k, arr);
      }
      arr.push(i);
    }
  }

  _cell(L, A, B) {
    const b = this.bins;
    return [
      clamp(Math.floor((L / 100) * b), 0, b - 1),
      clamp(Math.floor(((A + 100) / 200) * b), 0, b - 1),
      clamp(Math.floor(((B + 100) / 200) * b), 0, b - 1),
    ];
  }

  _key(L, A, B) {
    const c = this._cell(L, A, B);
    return (c[0] * this.bins + c[1]) * this.bins + c[2];
  }

  /** Expanding-shell gather until at least k candidates are found. */
  query(L, A, B, k, out) {
    out.length = 0;
    const b = this.bins,
      c = this._cell(L, A, B);
    for (let r = 0; r < b; r++) {
      for (let i = c[0] - r; i <= c[0] + r; i++) {
        if (i < 0 || i >= b) continue;
        for (let j = c[1] - r; j <= c[1] + r; j++) {
          if (j < 0 || j >= b) continue;
          for (let l = c[2] - r; l <= c[2] + r; l++) {
            if (l < 0 || l >= b) continue;
            if (Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(l - c[2])) !== r)
              continue;
            const arr = this.buckets.get((i * b + j) * b + l);
            if (arr) for (let q = 0; q < arr.length; q++) out.push(arr[q]);
          }
        }
      }
      if (out.length >= k) break;
    }
    if (!out.length) for (let i = 0; i < Math.min(this.album.n, k); i++) out.push(i);
    return out;
  }
}

/* ==========================================================================
 * 4. world — deterministic recursive tile tree
 * ======================================================================== */

const scratchDesc = new Float32Array(15);
const scratchCand = [];
const scratchScored = [];
/**
 * Deterministic recursive tile tree.
 *
 * The fractal is defined **per photo**, not per path: photo `p` always breaks
 * into the same r×r mosaic, wherever — and however deep — it appears. Each
 * photo's decomposition (child picks + per-child jitter + per-child tint) is
 * computed once and cached, so descending one more level is a single array
 * lookup and costs *no* extra memory. That is what makes the zoom unbounded:
 * the old implementation kept a node per path from the origin, so both the
 * cache keys and the walk grew with depth and the recursion effectively
 * stalled after the first level or two.
 *
 * Everything is derived from `seed` (user editable), so one seed always
 * reproduces exactly the same infinite layout.
 */

class World {
  constructor(album, index) {
    this.album = album;
    this.index = index;
    this.mode = 'album';
    this.heroIdx = album.heroIdx >= 0 ? album.heroIdx : 0;
    this.seed = String(CFG.seed);
    /** photoIdx * 1024 + radix -> {r, dg, kid, bias, tint} */
    this.decomp = new Map();
    this.decompCells = 0;
    // Decompositions still being filled in, oldest first. A 256×256 mosaic
    // is 65 536 nearest-neighbour searches, so cells are produced in
    // time-sliced chunks (pumpBuild) instead of in one blocking call.
    this.jobs = [];
    this.cellsBuilt = 0;
    this.epoch = 0;
    this.radixCache = [];
    this.generated = 0;
    // Camera-path chain, rebuilt once per frame by prepare(); neighbouring
    // tiles then only re-walk the digits that actually differ.
    this._chainPhoto = new Int32Array(64);
    this._chainBias = new Float32Array(64);
    this._chainTint = new Float32Array(64 * 3);
    this._chainDX = new Int32Array(64);
    this._chainDY = new Int32Array(64);
    this._dx = new Int32Array(64);
    this._dy = new Int32Array(64);
    this._chainLen = -1;
    this._chainRX = 0;
    this._chainRY = 0;
    // tileAt() output — single-threaded, avoids an object per visible tile.
    this.tPhoto = 0;
    this.tBias = 1;
    this.tTr = 1;
    this.tTg = 1;
    this.tTb = 1;
    this._applySeed();
  }

  configure(o = {}) {
    let reseed = false;
    if (o.mode !== undefined && o.mode !== this.mode) {
      this.mode = o.mode;
      reseed = true;
    }
    if (o.heroIdx !== undefined && o.heroIdx !== this.heroIdx) {
      this.heroIdx = o.heroIdx;
      reseed = true;
    }
    if (o.seed !== undefined && String(o.seed) !== this.seed) {
      this.seed = String(o.seed);
      reseed = true;
    }
    if (o.invalidate) reseed = true;
    if (reseed) this._applySeed();
    return reseed;
  }

  _applySeed() {
    this.worldSeed = mix32(mix32(this.album.seedNum, hashString(this.seed)), hashString(this.mode));
    this.radixCache = [];
    this.cancelBuilds();
    this.decomp.clear();
    this.decompCells = 0;
    this.epoch++;
    this._chainLen = -1;
  }
  /** Grow the scratch path buffers so they can hold `n` levels. */
  _grow(n) {
    if (n <= this._dx.length) return;
    const cap = 1 << Math.ceil(Math.log2(n + 8));
    const gi = (a) => {
      const b = new Int32Array(cap);
      b.set(a);
      return b;
    };
    const gf = (a, k) => {
      const b = new Float32Array(cap * k);
      b.set(a);
      return b;
    };
    this._dx = gi(this._dx);
    this._dy = gi(this._dy);
    this._chainDX = gi(this._chainDX);
    this._chainDY = gi(this._chainDY);
    this._chainPhoto = gi(this._chainPhoto);
    this._chainBias = gf(this._chainBias, 1);
    this._chainTint = gf(this._chainTint, 3);
  }

  /** Uniform mosaic grid size for tiles at `level` (deterministic). */
  radix(level) {
    // A user-pinned grid short-circuits the per-level lottery entirely.
    if (CFG.radix >= 2) return Math.min(CFG.radix | 0, CFG.maxRadix);
    let r = this.radixCache[level];
    if (r === undefined) {
      const choices =
        CFG.radixChoices && CFG.radixChoices.length ? CFG.radixChoices : AUTO_PRESETS[0].choices;
      const h = mix32(this.worldSeed ^ 0x5bf03635, (level + 1) * 0x9e3779b1);
      r = choices[h % choices.length];
      this.radixCache[level] = r;
    }
    return r;
  }

  _rootHash(rx, ry) {
    return mix32(mix32(this.worldSeed, (rx | 0) * 0x9e3779b1), (ry | 0) * 0x85ebca77);
  }

  /** Photo shown by the root cell (rx, ry) — pure function of the seed. */
  rootPhoto(rx, ry) {
    if (this.mode === 'hero') return clamp(this.heroIdx | 0, 0, this.album.n - 1);
    return this._rootHash(rx, ry) % this.album.n;
  }

  /** Per-tile multiplier on the dissolve threshold, so roots don't pop in unison. */
  rootBias(rx, ry) {
    const h = mix32(this._rootHash(rx, ry), 0x2545f491);
    return 1 + ((h >>> 8) / 16777216 - 0.5) * clamp(CFG.jitter, 0, 1);
  }

  /**
   * The cached decomposition of one photo into an r×r mosaic.
   *
   * This is the whole engine: it is keyed by (photo, grid size) only, so it
   * is reused at every depth and every location, the same photo always
   * dissolves the same way (true self-similarity), and the recursive
   * geometry walk never allocates.
   *
   * `dg` records the target-field resolution the picks were made from. A
   * decomposition is rebuilt only when a *sharper* field has arrived, so
   * evicting a field never downgrades an existing mosaic, and once a photo
   * has been decomposed at everything its pixels can offer we stop asking.
   *
   * `full` = "this mosaic is about to be drawn", which puts the (possibly
   * very large) decomposition on the background build queue. Callers that
   * only need a single cell — the camera path — pass false and use
   * ensureCell() instead, so descending never blocks on a 65 536-cell build.
   */
  decompose(photoIdx, r, full) {
    const key = photoIdx * 1024 + r;
    let d = this.decomp.get(key);
    // Splitting into r×r needs a target field at least r fine — 2r so each
    // sub-cell still has a resolvable 2×2 — bounded by the real pixels.
    const cap = this.album.detailCapOf(photoIdx);
    const need = cap ? Math.min(r * 2, cap) : r * 2;

    if (!d || d.dg < need) {
      this.album.wantDetail(photoIdx, need);
      const dg = this.album.detailRes(photoIdx);
      // Never restart a multi-second build for a marginally sharper target
      // field: rebuild only when the upgrade is real (and the old one done).
      const worth = d ? d.complete && dg >= Math.min(need, Math.ceil(d.dg * 1.5)) : true;
      if (!d || (dg > d.dg && worth)) {
        if (d) this.decompCells -= d.r * d.r;
        d = this._alloc(photoIdx, r, dg);
        this.decomp.set(key, d);
        this.decompCells += r * r;
        this._evictDecomp(key);
      }
    }
    if (full) this._queue(d);
    // Small mosaics are cheap enough to finish inline — no splash, no delay.
    if (!d.complete && d.cells <= (CFG.buildSyncCells | 0)) this.fill(d, Infinity);
    return d;
  }

  _evictDecomp(keep) {
    const cellMax = Math.max(1 << 16, CFG.decompCellBudget | 0);
    if (this.decomp.size <= CFG.decompCacheMax && this.decompCells <= cellMax) return;
    for (const [k, v] of this.decomp) {
      if (k === keep) continue;
      if (v.queued && !v.complete) continue; // never discard work in flight
      this.decomp.delete(k);
      this.decompCells -= v.r * v.r;
      v.dead = true;
      if (this.decomp.size <= CFG.decompCacheMax * 0.85 && this.decompCells <= cellMax * 0.85)
        break;
    }
  }

  /** Empty decomposition; cells are produced lazily by _fillCell(). */
  _alloc(photoIdx, r, dg) {
    const cells = r * r;
    this.generated++;
    return {
      photo: photoIdx,
      r,
      dg,
      cells,
      kid: new Int32Array(cells).fill(-1),
      bias: new Float32Array(cells),
      tint: new Float32Array(cells * 3),
      // Sibling-diversity memory (allocated lazily, freed on completion).
      // A pick depends on which siblings were placed *before* it, so the
      // memory's scope fixes the order in which cells may be produced. Small
      // mosaics are always finished inline in row-major order and share one
      // set. Background-built ones can be entered by the camera before they
      // are done, so they scope the memory per row: a cell then depends only
      // on the cells to its left, which ensureCell() can afford to produce
      // first — the layout stays byte-identical regardless of zoom history.
      rowScoped: cells > (CFG.buildSyncCells | 0),
      used: null,
      rowDone: null,
      // A sub-cell's own 2×2 only carries information once the target field
      // resolves it; below that the quads collapse to the mean.
      sw: CFG.structure * clamp(dg / r - 1, 0, 1),
      base: mix32(this.worldSeed ^ 0x6a09e667, (photoIdx + 1) * 0x9e3779b1 + r * 0x165667b1),
      next: 0,
      done: 0,
      queued: false,
      dead: false,
      complete: false,
    };
  }

  /** Choose the sub-image (and its jitter + tint) for one cell. */
  _fillCell(d, ci) {
    if (d.kid[ci] >= 0) return false;
    const r = d.r,
      cx = ci % r,
      cy = (ci / r) | 0;
    const rng = rngFrom(mix32(d.base, (ci + 1) * 0x27d4eb2d));
    // Split the parent's target descriptor across sub-cells.
    const desc = this.album.descriptor(
      d.photo,
      cx / r,
      cy / r,
      (cx + 1) / r,
      (cy + 1) / r,
      scratchDesc
    );
    const used = this._usedFor(d, cy);
    const p = this._pick(desc, rng, d.photo, used, d.sw);
    d.kid[ci] = p;
    used.add(p);
    if (d.rowScoped && ++d.rowDone[cy] >= r) d.used[cy] = null; // row finished
    d.bias[ci] = 1 + (rng() - 0.5) * clamp(CFG.jitter, 0, 1);
    // Per-tile colour-correction gain: even a perfect nearest neighbour is
    // only *near* the target colour.
    const t = labToRgb(desc[0], desc[1], desc[2]);
    const s = this.album.rgbOf(p);
    d.tint[ci * 3] = clamp(t[0] / Math.max(0.04, s[0]), 0.35, 2.6);
    d.tint[ci * 3 + 1] = clamp(t[1] / Math.max(0.04, s[1]), 0.35, 2.6);
    d.tint[ci * 3 + 2] = clamp(t[2] / Math.max(0.04, s[2]), 0.35, 2.6);
    d.done++;
    this.cellsBuilt++;
    if (d.done >= d.cells) {
      d.complete = true;
      d.used = d.rowDone = null;
    }
    return true;
  }

  /** Sibling memory a cell consults: its row's for large mosaics, else global. */
  _usedFor(d, cy) {
    if (!d.rowScoped) return d.used || (d.used = new Set());
    if (!d.used) {
      d.used = new Array(d.r).fill(null);
      d.rowDone = new Uint16Array(d.r);
    }
    return d.used[cy] || (d.used[cy] = new Set());
  }

  /**
   * Produce one specific cell right now (camera path). Cells are only ever
   * produced in build order — the rest of its row for a row-scoped mosaic
   * (at most r nearest-neighbour searches, once), everything still pending
   * for a small one — so an early, out-of-order visit yields exactly the
   * pick the background builder would have made.
   */
  ensureCell(d, ci) {
    if (!d || ci < 0 || ci >= d.cells || d.kid[ci] >= 0) return;
    const from = d.rowScoped ? ci - (ci % d.r) : d.next;
    for (let c = from; c <= ci; c++) this._fillCell(d, c);
    if (!d.rowScoped) d.next = Math.max(d.next, ci + 1);
  }

  _queue(d) {
    if (!d || d.complete || d.queued || d.dead) return;
    if (this.jobs.length >= Math.max(1, CFG.maxBuildJobs | 0)) return;
    d.queued = true;
    this.jobs.push(d);
  }

  /** Fill `d` for up to `ms` milliseconds. Returns the number of new cells. */
  fill(d, ms) {
    if (!d || d.complete || d.dead) return 0;
    const t0 = performance.now();
    let n = 0,
      iter = 0;
    while (d.next < d.cells) {
      if (this._fillCell(d, d.next++)) n++;
      if ((++iter & 127) === 0 && performance.now() - t0 >= ms) break;
    }
    if (d.next >= d.cells) {
      d.complete = true;
      d.queued = false;
    }
    return n;
  }

  /** Frame-budgeted background builder for everything on screen. */
  pumpBuild(ms) {
    const t0 = performance.now();
    let n = 0;
    while (this.jobs.length) {
      const d = this.jobs[0];
      if (d.dead || d.complete) {
        d.queued = false;
        this.jobs.shift();
        continue;
      }
      n += this.fill(d, ms - (performance.now() - t0));
      if (!d.complete) break;
      this.jobs.shift();
      if (performance.now() - t0 >= ms) break;
    }
    return n;
  }

  /** Pending build work, for the "calculating" splash. */
  buildProgress() {
    let total = 0,
      done = 0;
    for (let i = 0; i < this.jobs.length; i++) {
      const d = this.jobs[i];
      if (d.dead) continue;
      total += d.cells;
      done += d.done;
    }
    return { total, done, r: this.jobs.length ? this.jobs[0].r : 0 };
  }

  cancelBuilds() {
    for (let i = 0; i < this.jobs.length; i++) this.jobs[i].queued = false;
    this.jobs.length = 0;
  }

  /** `avoid` = the photo being decomposed; `used` = siblings already placed in this cell's memory scope (see _usedFor). */
  _pick(desc, rng, avoid, used, structW) {
    const cand = this.index.query(desc[0], desc[1], desc[2], CFG.candidateK, scratchCand);
    const penalty = 900 * CFG.diversity;
    scratchScored.length = 0;
    for (let i = 0; i < cand.length; i++) {
      const idx = cand[i];
      let d = featDist(this.album, idx, desc, structW);
      // A photo must not be its own mosaic tile, and siblings should not
      // repeat: both would read as an artefact rather than a mosaic.
      if (idx === avoid) d += penalty;
      else if (used && used.has(idx)) d += penalty * 0.5;
      scratchScored.push(idx, d);
    }
    // partial selection sort for the top-N
    const N = Math.min(CFG.topPick, scratchScored.length / 2);
    for (let a = 0; a < N; a++) {
      let best = a;
      for (let b = a + 1; b < scratchScored.length / 2; b++) {
        if (scratchScored[b * 2 + 1] < scratchScored[best * 2 + 1]) best = b;
      }
      if (best !== a) {
        let t = scratchScored[a * 2];
        scratchScored[a * 2] = scratchScored[best * 2];
        scratchScored[best * 2] = t;
        t = scratchScored[a * 2 + 1];
        scratchScored[a * 2 + 1] = scratchScored[best * 2 + 1];
        scratchScored[best * 2 + 1] = t;
      }
    }
    if (!N) return 0;
    const pick = Math.min(N - 1, Math.floor(Math.pow(rng(), CFG.pickBias) * N));
    return scratchScored[pick * 2];
  }

  /** Mixed-radix carry: shift a digit path by an integer tile offset. */
  carry(root, digits, axis, delta) {
    let d = digits.length;
    while (d > 0 && delta !== 0) {
      const r = this.radix(d - 1);
      const v = digits[d - 1][axis] + delta;
      const q = Math.floor(v / r);
      digits[d - 1][axis] = v - q * r;
      delta = q;
      d--;
    }
    if (delta !== 0) root[axis] += delta;
  }

  /** Same carry, on the flat scratch digit buffers. Returns the new root. */
  _carryArr(arr, len, delta, rootV) {
    let d = len;
    while (d > 0 && delta !== 0) {
      const r = this.radix(d - 1);
      const v = arr[d - 1] + delta;
      const q = Math.floor(v / r);
      arr[d - 1] = v - q * r;
      delta = q;
      d--;
    }
    return rootV + delta;
  }

  /**
   * Resolve (and memoise) the camera's own path once per frame. Neighbouring
   * tiles share a prefix with it, so their walk is O(1) no matter how deep
   * the camera has descended.
   */
  prepare(root, digits, level) {
    this._grow(level + 2);
    const cp = this._chainPhoto,
      cb = this._chainBias,
      ct = this._chainTint;
    cp[0] = this.rootPhoto(root.x, root.y);
    cb[0] = this.rootBias(root.x, root.y);
    ct[0] = ct[1] = ct[2] = 1;
    for (let i = 0; i < level; i++) {
      const r = this.radix(i);
      const gx = clamp(digits[i].x | 0, 0, r - 1),
        gy = clamp(digits[i].y | 0, 0, r - 1);
      this._chainDX[i] = digits[i].x | 0;
      this._chainDY[i] = digits[i].y | 0;
      const d = this.decompose(cp[i], r, false);
      const ci = gy * r + gx;
      this.ensureCell(d, ci); // one cell only — never waits for the mosaic
      cp[i + 1] = d.kid[ci];
      cb[i + 1] = d.bias[ci];
      ct[(i + 1) * 3] = d.tint[ci * 3];
      ct[(i + 1) * 3 + 1] = d.tint[ci * 3 + 1];
      ct[(i + 1) * 3 + 2] = d.tint[ci * 3 + 2];
    }
    this._chainLen = level;
    this._chainRX = root.x | 0;
    this._chainRY = root.y | 0;
  }

  /**
   * Tile at `level`, offset by (di,dj) tiles from the camera's path.
   * Results land in tPhoto / tBias / tTr,tTg,tTb (no allocation).
   */
  tileAt(root, digits, level, di, dj) {
    this._grow(level + 2);
    const dx = this._dx,
      dy = this._dy;
    for (let i = 0; i < level; i++) {
      dx[i] = digits[i].x | 0;
      dy[i] = digits[i].y | 0;
    }
    let rx = root.x | 0,
      ry = root.y | 0;
    if (di) rx = this._carryArr(dx, level, di, rx);
    if (dj) ry = this._carryArr(dy, level, dj, ry);
    let m = 0,
      photo,
      bias,
      tr = 1,
      tg = 1,
      tb = 1;
    if (this._chainLen === level && rx === this._chainRX && ry === this._chainRY) {
      while (m < level && dx[m] === this._chainDX[m] && dy[m] === this._chainDY[m]) m++;
      photo = this._chainPhoto[m];
      bias = this._chainBias[m];
      tr = this._chainTint[m * 3];
      tg = this._chainTint[m * 3 + 1];
      tb = this._chainTint[m * 3 + 2];
    } else {
      photo = this.rootPhoto(rx, ry);
      bias = this.rootBias(rx, ry);
    }
    for (let i = m; i < level; i++) {
      const r = this.radix(i);
      const d = this.decompose(photo, r, false);
      const ci = clamp(dy[i], 0, r - 1) * r + clamp(dx[i], 0, r - 1);
      this.ensureCell(d, ci);
      photo = d.kid[ci];
      bias = d.bias[ci];
      tr = d.tint[ci * 3];
      tg = d.tint[ci * 3 + 1];
      tb = d.tint[ci * 3 + 2];
    }
    this.tPhoto = photo;
    this.tBias = bias;
    this.tTr = tr;
    this.tTg = tg;
    this.tTb = tb;
    return photo;
  }
}

/* ==========================================================================
 * 5. camera — integer path + bounded fraction (no float precision loss)
 * ======================================================================== */

class Camera {
  constructor(world) {
    this.world = world;
    this.root = { x: 0, y: 0 };
    this.digits = [];
    this.frac = { x: 0.5, y: 0.5 };
    this.tilePx = 700;
  }

  get depth() {
    return this.digits.length;
  }

  home() {
    this.root = { x: 0, y: 0 };
    this.digits = [];
    this.frac = { x: 0.5, y: 0.5 };
    this.tilePx = 700;
  }

  /** After a radix change, old digits may exceed the new grid — fold them in. */
  clampDigits() {
    for (let i = 0; i < this.digits.length; i++) {
      const r = this.world.radix(i);
      this.digits[i].x = clamp(this.digits[i].x | 0, 0, r - 1);
      this.digits[i].y = clamp(this.digits[i].y | 0, 0, r - 1);
    }
    this.frac.x = clamp(this.frac.x, 0, 0.999999);
    this.frac.y = clamp(this.frac.y, 0, 0.999999);
  }

  pan(dx, dy) {
    this.frac.x -= dx / this.tilePx;
    this.frac.y -= dy / this.tilePx;
  }

  zoomAt(factor, sx, sy, W, H) {
    const px = this.frac.x + (sx - W / 2) / this.tilePx;
    const py = this.frac.y + (sy - H / 2) / this.tilePx;
    this.tilePx *= factor;
    this.frac.x = px - (sx - W / 2) / this.tilePx;
    this.frac.y = py - (sy - H / 2) / this.tilePx;
  }

  /** Keep the focus tile just larger than the viewport; fold the fraction. */
  normalize(W, H) {
    const V = Math.max(W, H);
    let ix = Math.floor(this.frac.x);
    if (ix) {
      this.world.carry(this.root, this.digits, 'x', ix);
      this.frac.x -= ix;
    }
    let iy = Math.floor(this.frac.y);
    if (iy) {
      this.world.carry(this.root, this.digits, 'y', iy);
      this.frac.y -= iy;
    }

    for (let guard = 0; guard < 128; guard++) {
      const rd = this.world.radix(this.digits.length);
      if (this.digits.length < CFG.maxLevel && this.tilePx >= V * rd) {
        const fx = this.frac.x * rd,
          fy = this.frac.y * rd;
        const cx = clamp(Math.floor(fx), 0, rd - 1),
          cy = clamp(Math.floor(fy), 0, rd - 1);
        this.digits.push({ x: cx, y: cy });
        this.frac.x = fx - cx;
        this.frac.y = fy - cy;
        this.tilePx /= rd;
        continue;
      }
      if (this.tilePx < V && this.digits.length > 0) {
        const d = this.digits.pop();
        const rp = this.world.radix(this.digits.length);
        this.frac.x = (d.x + this.frac.x) / rp;
        this.frac.y = (d.y + this.frac.y) / rp;
        this.tilePx *= rp;
        continue;
      }
      break;
    }
    // Zoom-out floor for the top level only.
    //
    // There is deliberately **no** fixed zoom-in ceiling any more. Pushing a
    // digit needs the focus tile to reach V * radix(level); the old
    // unconditional `V * 12` cap sits *below* that threshold for every
    // mosaic grid coarser than 12×12 (any pinned grid >= 13, or the "mixed
    // 8–16" auto preset). The camera then pinned itself at level 0 after a
    // single dissolve — i.e. exactly one level of zoom, with the depth ring
    // frozen at log(12)/log(radix). The loop above already descends before
    // tilePx can run away, so the only case that still needs a ceiling is
    // having genuinely run out of levels.
    if (this.digits.length === 0) this.tilePx = Math.max(this.tilePx, V / 5);
    if (this.digits.length >= CFG.maxLevel)
      this.tilePx = Math.min(this.tilePx, V * this.world.radix(this.digits.length));
  }

  /** Fractional depth + decimal magnification, for the HUD. */
  metrics(W, H) {
    const V = Math.max(W, H);
    const rd = this.world.radix(this.digits.length);
    const frac = clamp(Math.log(this.tilePx / V) / Math.log(rd), 0, 1);
    let log10 = Math.log10(this.tilePx / V);
    for (let i = 0; i < this.digits.length; i++) log10 += Math.log10(this.world.radix(i));
    return { depth: this.digits.length, frac, log10 };
  }
}

/* ==========================================================================
 * 6. renderer — WebGL2, instanced textured quads, level-ordered batching
 * ======================================================================== */

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aRect;
layout(location=2) in vec4 aUV;
layout(location=3) in vec4 aColor;
uniform vec2 uRes;
out vec2 vUV;
out vec4 vColor;
void main() {
  vec2 p = aRect.xy + aCorner * aRect.zw;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
  vUV = aUV.xy + aCorner * aUV.zw;
  vColor = aColor;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uTex;
uniform float uUseTex;
out vec4 frag;
void main() {
  // Textured: vColor.rgb is a per-tile colour-correction gain.
  // Untextured: vColor.rgb is the flat fallback colour itself.
  vec3 t = texture(uTex, vUV).rgb * vColor.rgb;
  vec3 c = mix(vColor.rgb, t, uUseTex);
  frag = vec4(c * vColor.a, vColor.a); // premultiplied
}`;

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required for this viewer.');
    this.gl = gl;
    this.prog = this._program(VS, FS);
    this.uRes = gl.getUniformLocation(this.prog, 'uRes');
    this.uUseTex = gl.getUniformLocation(this.prog, 'uUseTex');
    this.uTex = gl.getUniformLocation(this.prog, 'uTex');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    for (let i = 1; i <= 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);

    this.white = this._solidTexture([255, 255, 255, 255]);
    this.data = new Float32Array(4096 * 12);
    this.quads = [];
    this._qpool = [];
    this.texIds = new WeakMap();
    this.nextTexId = 1;

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  _program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  _solidTexture(rgba) {
    const gl = this.gl,
      t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(rgba)
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  texId(tex) {
    if (!tex) return 0;
    let id = this.texIds.get(tex);
    if (!id) {
      id = this.nextTexId++;
      this.texIds.set(tex, id);
    }
    return id;
  }

  begin(W, H) {
    this.W = W;
    this.H = H;
    this.quads.length = 0;
    const gl = this.gl;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.027, 0.031, 0.043, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  push(lvl, tex, uv, x, y, w, h, r, g, b, a, useTex) {
    // Records are pooled: at ~14k quads/frame, allocating objects here was a
    // measurable share of the frame time (and of GC pauses).
    const n = this.quads.length;
    let q = this._qpool[n];
    if (!q) {
      q = this._qpool[n] = {
        lvl: 0,
        tex: null,
        tid: 0,
        u0: 0,
        v0: 0,
        du: 0,
        dv: 0,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        r: 0,
        g: 0,
        b: 0,
        a: 0,
        useTex: 0,
      };
    }
    q.lvl = lvl;
    q.tex = tex;
    q.tid = this.texId(tex) * 2 + (useTex ? 1 : 0);
    q.u0 = uv[0];
    q.v0 = uv[1];
    q.du = uv[2];
    q.dv = uv[3];
    q.x = x;
    q.y = y;
    q.w = w;
    q.h = h;
    q.r = r;
    q.g = g;
    q.b = b;
    q.a = a;
    q.useTex = useTex;
    this.quads.push(q);
  }

  flush() {
    const gl = this.gl,
      q = this.quads;
    if (!q.length) return 0;
    // Parents (lower level) must be drawn beneath their children.
    q.sort((a, b) => a.lvl - b.lvl || a.tid - b.tid);
    const need = q.length * 12;
    if (this.data.length < need) this.data = new Float32Array(Math.ceil(need * 1.4));
    const d = this.data;
    for (let i = 0; i < q.length; i++) {
      const o = i * 12,
        t = q[i];
      d[o] = t.x;
      d[o + 1] = t.y;
      d[o + 2] = t.w;
      d[o + 3] = t.h;
      d[o + 4] = t.u0;
      d[o + 5] = t.v0;
      d[o + 6] = t.du;
      d[o + 7] = t.dv;
      d[o + 8] = t.r;
      d[o + 9] = t.g;
      d[o + 10] = t.b;
      d[o + 11] = t.a;
    }
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, this.W, this.H);
    gl.uniform1i(this.uTex, 0);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, need), gl.DYNAMIC_DRAW);

    const STRIDE = 48;
    let start = 0,
      batches = 0;
    while (start < q.length) {
      const tid = q[start].tid;
      let end = start + 1;
      while (end < q.length && q[end].tid === tid) end++;
      const off = start * STRIDE;
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE, off);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE, off + 16);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, STRIDE, off + 32);
      const use = q[start].useTex ? 1 : 0;
      gl.uniform1f(this.uUseTex, use);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, use ? q[start].tex : this.white);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, end - start);
      batches++;
      start = end;
    }
    gl.bindVertexArray(null);
    return batches;
  }
}

/* ==========================================================================
 * 7. textures — priority loading queue + LRU GPU texture pool
 * ======================================================================== */

class TexturePool {
  constructor(gl, album, onAtlas) {
    this.gl = gl;
    this.album = album;
    this.map = new Map();
    this.queue = [];
    this.active = 0;
    this.frameId = 0;
    this.atlas = null;
    // Full-resolution decodes made *only* to learn a target field.
    this.detailActive = 0;
    this._detailLoading = new Set();
    // Set before the (possibly synchronous) atlas load kicks off.
    this.onAtlas = onAtlas || null;
    this._loadAtlas();
  }
  /**
   * Feed the target-field learner.
   *
   * The display path only ever decodes the mip that fits the tile on screen,
   * which is *not* enough to partition a photo into (say) 512×512: the field
   * has to come from the largest mip the album has. These decodes are almost
   * always served from the browser cache (it is the same URL the tile is
   * already showing) and are strictly bounded in flight.
   */
  pumpDetail() {
    while (this.detailActive < 2) {
      const i = this.album.nextDetailNeed();
      if (i < 0) break;
      if (this._detailLoading.has(i)) continue;
      this._loadDetail(i);
    }
  }
  async _loadDetail(i) {
    this._detailLoading.add(i);
    this.detailActive++;
    try {
      const src = this.album.getSource(i, this.album.mipSizes.length - 1);
      const drawable = src.canvas ? src.canvas : await loadImage(src.url);
      if (this.album.learnDetail(i, drawable, true)) markDirty();
      if (drawable.close) drawable.close();
    } catch (err) {
      this.album.failDetail(i);
    } finally {
      this.detailActive--;
      this._detailLoading.delete(i);
    }
  }

  async _loadAtlas() {
    const src = this.album.atlasSource;
    if (!src) return;
    try {
      const drawable = src.canvas ? src.canvas : await loadImage(src.url);
      this.atlas = this._upload(drawable, false);
      if (this.onAtlas) this.onAtlas(drawable);
    } catch (e) {
      /* atlas is optional */
    }
  }

  _upload(drawable, mipmap) {
    const gl = this.gl,
      t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawable);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return t;
  }

  key(i, mip) {
    return i * 16 + mip;
  }

  atlasEntry(i) {
    if (!this.atlas || !this.album.atlasUV) return null;
    const o = i * 4;
    return { tex: this.atlas, uv: this.album.atlasUV.subarray(o, o + 4) };
  }

  /** Best already-resident mip for photo i, requesting `mip` in the background. */
  getBest(i, mip, prio) {
    this.request(i, mip, prio);
    for (let m = mip; m >= 0; m--) {
      const e = this.map.get(this.key(i, m));
      if (e && e.tex) {
        e.used = this.frameId;
        return e;
      }
    }
    for (let m = mip + 1; m < this.album.mipSizes.length; m++) {
      const e = this.map.get(this.key(i, m));
      if (e && e.tex) {
        e.used = this.frameId;
        return e;
      }
    }
    return null;
  }

  request(i, mip, prio) {
    const k = this.key(i, mip);
    let e = this.map.get(k);
    if (e) {
      e.req = this.frameId;
      if (prio > e.prio) e.prio = prio;
      return;
    }
    e = {
      i,
      mip,
      tex: null,
      uv: IDENT_UV,
      prio,
      req: this.frameId,
      used: this.frameId,
      state: 'queued',
    };
    this.map.set(k, e);
    this.queue.push(e);
    this.pump();
  }

  pump() {
    while (this.active < CFG.maxConcurrentLoads && this.queue.length) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++)
        if (this.queue[i].prio > this.queue[best].prio) best = i;
      const e = this.queue.splice(best, 1)[0];
      if (e.state !== 'queued') continue;
      this._load(e);
    }
  }

  async _load(e) {
    e.state = 'loading';
    this.active++;
    try {
      const src = this.album.getSource(e.i, e.mip);
      let drawable,
        uv = IDENT_UV;
      if (src.canvas) {
        drawable = src.canvas;
      } else {
        drawable = await loadImage(src.url);
      }
      // Derive the crop from the *actual* pixels rather than trusting the
      // manifest's squareCrop flag: a mip that is not square (hand-made or
      // older assets) was previously stretched into the tile.
      uv = coverUV(drawable.width || drawable.videoWidth, drawable.height || drawable.videoHeight);
      e.tex = this._upload(drawable, true);
      e.uv = uv;
      e.state = 'ready';
      // The pixels we just decoded are a far better description of this
      // photo than the 8×8 build-time signature — take them opportunistically
      // (a *partial* upgrade: this mip may be smaller than what the
      // partition ultimately needs, so it must not set the ceiling).
      const dw = drawable.width || drawable.naturalWidth || 0;
      const dh = drawable.height || drawable.naturalHeight || 0;
      if (Math.min(dw, dh) >= 64 && this.album.learnDetail(e.i, drawable, false)) markDirty();
      if (drawable.close) drawable.close();
    } catch (err) {
      e.state = 'error';
      this.map.delete(this.key(e.i, e.mip));
    } finally {
      this.active--;
      this.pump();
    }
  }

  /** Drop stale requests, evict cold textures. */
  endFrame() {
    this.frameId++;
    if (this.queue.length) {
      const stale = [];
      this.queue = this.queue.filter((e) => {
        if (e.req < this.frameId - 2) {
          stale.push(e);
          return false;
        }
        return true;
      });
      for (const e of stale) this.map.delete(this.key(e.i, e.mip));
    }
    if (this.map.size <= CFG.textureBudget) return;
    const live = [];
    for (const e of this.map.values()) if (e.tex) live.push(e);
    if (live.length <= CFG.textureBudget) return;
    live.sort((a, b) => a.used - b.used);
    let toDrop = live.length - CFG.textureBudget;
    for (const e of live) {
      if (toDrop <= 0) break;
      if (e.used >= this.frameId - 1) continue;
      this.gl.deleteTexture(e.tex);
      this.map.delete(this.key(e.i, e.mip));
      toDrop--;
    }
  }

  get residentCount() {
    let n = 0;
    for (const e of this.map.values()) if (e.tex) n++;
    return n;
  }
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image load failed: ' + url));
    img.src = url;
  });
}

/* ==========================================================================
 * 8. viewer — frustum walk, recursive fade-in of mosaics, frame loop
 * ======================================================================== */
/**
 * "Precalculate all" — walks the whole album building every photo's mosaic
 * decomposition at one grid size, time-sliced so the page stays responsive.
 * Cancellable, and reports a live ETA derived from the measured cell rate.
 *
 * Note that at a fine grid the *cache* (CFG.decompCellBudget) may hold fewer
 * decompositions than the album has photos; `fits` is reported so the HUD can
 * say so rather than silently churning.
 */
class BatchBuild {
  constructor(viewer, r) {
    this.viewer = viewer;
    this.world = viewer.world;
    this.album = viewer.album;
    this.pool = viewer.pool;
    this.r = clamp(r | 0, 2, CFG.maxRadix);
    this.cells = this.r * this.r;
    this.n = this.album.n;
    this.total = this.n * this.cells;
    this.i = 0;
    this.done = 0;
    this.cur = null;
    this.wait = 0;
    this.waiting = false;
    this.t0 = performance.now();
    this.epoch = this.world.epoch;
    this.cancelled = false;
    this.finished = this.n === 0;
    this.fits = Math.max(1, Math.floor(Math.max(1 << 16, CFG.decompCellBudget | 0) / this.cells));
  }
  cancel() {
    this.cancelled = true;
    this.finished = true;
    this.cur = null;
  }
  cellsDone() {
    return this.done + (this.cur ? this.cur.done : 0);
  }
  frac() {
    return this.total ? clamp(this.cellsDone() / this.total, 0, 1) : 1;
  }
  /** Seconds remaining, Infinity until there is enough of a sample. */
  eta() {
    const d = this.cellsDone(),
      el = (performance.now() - this.t0) / 1000;
    if (d < 256 || el < 0.4) return Infinity;
    return ((this.total - d) * el) / d;
  }
  step(ms) {
    if (this.finished) return;
    // A reseed / grid change invalidates everything we were building.
    if (this.world.epoch !== this.epoch) return this.cancel();
    const t0 = performance.now();
    this.pool.pumpDetail();
    this.waiting = false;
    while (this.i < this.n) {
      const p = this.i;
      const cap = this.album.detailCapOf(p);
      const need = cap ? Math.min(this.r * 2, cap) : this.r * 2;
      // Picking from a coarse target field would only have to be redone, so
      // give the full-resolution decode a bounded moment to land.
      if (this.album.detailRes(p) < Math.min(need, this.r)) {
        this.album.wantDetail(p, need);
        if (!this.wait) this.wait = performance.now() + 3000;
        if (performance.now() < this.wait) {
          this.waiting = true;
          return;
        }
      }
      this.wait = 0;
      const d = (this.cur = this.world.decompose(p, this.r, false));
      if (!d.complete) this.world.fill(d, Math.max(1, ms - (performance.now() - t0)));
      if (!d.complete) return;
      this.done += this.cells;
      this.cur = null;
      this.i++;
      if (performance.now() - t0 >= ms) return;
    }
    this.finished = true;
  }
}

class Viewer {
  constructor(canvas, album) {
    this.canvas = canvas;
    this.album = album;
    this.index = new ColorIndex(album);
    this.world = new World(album, this.index);
    this.camera = new Camera(this.world);
    this.renderer = new Renderer(canvas);
    this.pool = new TexturePool(this.renderer.gl, album, (d) => this._onAtlasReady(d));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dive = 0;
    this.batch = null; // active "precalculate all" job, if any
    this.lodScale = 1; // adaptive multiplier on the partition granularity
    this.stats = { quads: 0, tiles: 0, fps: 0, batches: 0, lod: 1 };
    this._fpsAcc = 0;
    this._fpsN = 0;
    this.resize();
  }

  /**
   * The thumbnail atlas carries far more spatial detail than the build-time
   * signature index. Re-derive the grid from it, then rebuild everything
   * that was derived from the old, coarse signatures: the nearest-neighbour
   * buckets and the (now stale) tile picks.
   */
  _onAtlasReady(drawable) {
    if (!this.album.refineFromAtlas(drawable)) return;
    this.index = new ColorIndex(this.album);
    this.world.index = this.index;
    this.world.configure({ invalidate: true });
    markDirty();
  }

  resize() {
    const dpr = (this.dpr = Math.min(window.devicePixelRatio || 1, 2));
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.W = w;
    this.H = h;
  }

  /** Kick off a full-album precalculation at grid `r`. */
  precalc(r) {
    this.batch = new BatchBuild(this, r);
    return this.batch;
  }

  frame(dt) {
    this.resize();
    const cam = this.camera,
      W = this.W,
      H = this.H;
    // Incremental subdivision builder. The batch job gets a fat slice (the
    // user is staring at a progress bar); ordinary browsing gets a small one.
    if (this.batch && !this.batch.finished) {
      this.batch.step(CFG.batchMsPerFrame);
      if (this.batch.finished && !this.batch.cancelled)
        toast(
          `Precalculated ${this.batch.n} photos in ${fmtTime(
            (performance.now() - this.batch.t0) / 1000
          )}`
        );
    } else {
      this.world.pumpBuild(CFG.buildMsPerFrame);
    }
    if (this.dive) {
      cam.zoomAt(Math.pow(2.0, this.dive * dt), W / 2, H / 2, W, H);
    }
    cam.normalize(W, H);

    this.renderer.begin(W, H);
    this.quadCount = 0;
    this.tileCount = 0;
    // Partition granularity (device px per sub-image), nudged by the adaptive
    // LOD scaler so a fine setting degrades gracefully instead of collapsing.
    this.SUB = Math.max(0.5, CFG.tilePx) * this.dpr * this.lodScale;
    // LOD floor: hard stop on how small a subdivided tile may become.
    this.MINPX = Math.max(1, CFG.minTilePx) * this.dpr;
    this.quadBudget = Math.max(600, CFG.maxQuads | 0);
    // Below the smallest mip there is nothing to gain from a real texture.
    this.atlasCutoff = (this.album.mipSizes[0] || 16) * 1.25;

    // ---- locate the top-of-walk tile (one level above the focus tile) ----
    const startLevel = Math.max(0, cam.depth - 1);
    let x = W / 2 - cam.frac.x * cam.tilePx;
    let y = H / 2 - cam.frac.y * cam.tilePx;
    let s = cam.tilePx;
    for (let l = cam.depth; l > startLevel; l--) {
      const d = cam.digits[l - 1];
      const rp = this.world.radix(l - 1);
      x -= d.x * s;
      y -= d.y * s;
      s *= rp;
    }
    // ---- iterate the visible neighbourhood at that level ----
    let i0 = Math.floor((0 - x) / s),
      i1 = Math.floor((W - 1 - x) / s);
    let j0 = Math.floor((0 - y) / s),
      j1 = Math.floor((H - 1 - y) / s);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > CFG.maxStartTiles) {
      const side = Math.floor(Math.sqrt(CFG.maxStartTiles) / 2);
      const ci = Math.floor((i0 + i1) / 2),
        cj = Math.floor((j0 + j1) / 2);
      i0 = ci - side;
      i1 = ci + side;
      j0 = cj - side;
      j1 = cj + side;
    }
    const wl = this.world;
    // Resolve the camera's own path once; every visible tile reuses it.
    wl.prepare(cam.root, cam.digits, startLevel);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        wl.tileAt(cam.root, cam.digits, startLevel, i, j);
        this.drawTile(
          wl.tPhoto,
          startLevel,
          wl.tBias,
          wl.tTr,
          wl.tTg,
          wl.tTb,
          x + i * s,
          y + j * s,
          s,
          1
        );
      }
    }
    this.stats.batches = this.renderer.flush();
    this.pool.endFrame();
    // Fetch full-resolution pixels for any photo the walk is now splitting
    // more finely than its current target field can describe.
    this.pool.pumpDetail();
    // ---- adaptive LOD ---------------------------------------------------
    // Quad count scales ~ 1/subtile², so sqrt(overshoot) is a one-step
    // correction. Tighten fast (protect the frame), relax slowly (no pumping).
    const over = this.quadCount / this.quadBudget;
    const want = clamp(this.lodScale * Math.sqrt(Math.max(over, 0.25)), 1, 24);
    this.lodScale += (want - this.lodScale) * (want > this.lodScale ? 0.5 : 0.06);
    this.stats.lod = this.lodScale;

    this.stats.quads = this.quadCount;
    this.stats.tiles = this.tileCount;
    this._fpsAcc += dt;
    this._fpsN++;
    if (this._fpsAcc > 0.4) {
      this.stats.fps = Math.round(this._fpsN / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsN = 0;
    }
  }

  /**
   * Recursive substitution render: a tile is drawn as its own photo and,
   * once large enough on screen, cross-fades into its mosaic of children.
   *
   * A tile is just (photoIdx, level) plus its geometry — children come from
   * the photo's cached decomposition, so this recursion is depth-unbounded.
   */
  drawTile(photoIdx, level, bias, tr, tg, tb, x, y, size, alpha) {
    if (x + size <= 0 || y + size <= 0 || x >= this.W || y >= this.H || alpha <= 0.004) return;
    this.tileCount++;
    const r = this.world.radix(level);
    // Threshold is expressed on the *children*: a photo only dissolves once each of
    // its r×r sub-images would occupy ~CFG.tilePx on screen. Finer grids therefore
    // simply wait until the parent is correspondingly larger, instead of degrading.
    const thresh = this.SUB * r * bias;
    const span = Math.max(1.02, CFG.fadeSpan);
    // Three independent gates decide whether this photo may dissolve at all:
    //   • recursion depth
    //   • the LOD floor  — children must stay above CFG.minTilePx on screen
    //   • the quad budget — once spent the walk simply stops going deeper,
    //     which is a no-op visually because the parent stays fully opaque.
    const canSplit =
      level < CFG.maxLevel && size / r >= this.MINPX && this.quadCount < this.quadBudget;
    let t = 0;
    let d = null;
    if (canSplit && size > thresh) {
      // The decomposition may still be under construction — a 256×256 mosaic
      // is 65 536 nearest-neighbour searches. Until it is finished the tile
      // just stays whole and the "calculating" splash reports the progress.
      d = this.world.decompose(photoIdx, r, true);
      if (d.complete) t = smooth(clamp((size / thresh - 1) / (span - 1), 0, 1));
      else d = null;
    }

    // A tile that is itself partially transparent cannot draw its photo
    // and its children as independent stacked layers: the two together
    // are the tile's contents and must share the tile's opacity.
    const childAlpha = alpha * t;
    const parentAlpha = t > 0.005 ? (alpha * (1 - t)) / Math.max(1e-6, 1 - childAlpha) : alpha;

    if (t < 0.995) this.pushTile(photoIdx, level, x, y, size, parentAlpha, tr, tg, tb);
    if (t > 0.005 && d) {
      const cs = size / r;
      const ca = childAlpha;
      // Only walk the cells that can be on screen: at r = 256 a full scan is
      // 65 536 iterations per dissolving tile, of which ~500 are visible.
      const cx0 = Math.max(0, Math.floor((0 - x) / cs)),
        cx1 = Math.min(r - 1, Math.floor((this.W - 1 - x) / cs));
      const cy0 = Math.max(0, Math.floor((0 - y) / cs)),
        cy1 = Math.min(r - 1, Math.floor((this.H - 1 - y) / cs));
      for (let cy = cy0; cy <= cy1; cy++) {
        const by = y + cy * cs;
        for (let cx = cx0; cx <= cx1; cx++) {
          const bx = x + cx * cs;
          const ci = cy * r + cx,
            o = ci * 3;
          this.drawTile(
            d.kid[ci],
            level + 1,
            d.bias[ci],
            d.tint[o],
            d.tint[o + 1],
            d.tint[o + 2],
            bx,
            by,
            cs,
            ca
          );
        }
      }
    }
  }

  pushTile(photoIdx, level, x, y, size, alpha, tr, tg, tb) {
    const i = photoIdx;
    this.quadCount++;
    // Seam bleed must stay *proportional*: a flat +1px stretched a 6px tile
    // by 17%, which is exactly the "distorted subdivision" artefact.
    const bleed = Math.min(1, size * 0.05);
    const w = size + bleed,
      h = size + bleed;
    // Colour-correction gain, dialled by CFG.tint (0 = raw photo).
    const k = clamp(CFG.tint, 0, 1);
    const gr = 1 + (tr - 1) * k,
      gg = 1 + (tg - 1) * k,
      gb = 1 + (tb - 1) * k;
    // Tiles smaller than the smallest mip are served from the packed atlas —
    // no load is queued for them, which also collapses them into one batch.
    const small = this.pool.atlasEntry(i);
    if (small && size <= this.atlasCutoff) {
      this.renderer.push(level, small.tex, small.uv, x, y, w, h, gr, gg, gb, alpha, 1);
      return;
    }
    const mip = this.album.mipFor(size);
    const e = this.pool.getBest(i, mip, size);
    if (e) {
      this.renderer.push(level, e.tex, e.uv, x, y, w, h, gr, gg, gb, alpha, 1);
      return;
    }
    const a = small;
    if (a) {
      this.renderer.push(level, a.tex, a.uv, x, y, w, h, gr, gg, gb, alpha, 1);
      return;
    }
    const c = this.album.rgbOf(i);
    this.renderer.push(
      level,
      null,
      IDENT_UV,
      x,
      y,
      w,
      h,
      clamp(c[0] * gr, 0, 1),
      clamp(c[1] * gg, 0, 1),
      clamp(c[2] * gb, 0, 1),
      alpha,
      0
    );
  }

  /** Deterministically hop to a distant, unexplored region. */
  jump() {
    const cam = this.camera;
    const rng = rngFrom((Math.random() * 0xffffffff) >>> 0);
    cam.home();
    cam.root.x = Math.floor((rng() - 0.5) * 4000);
    cam.root.y = Math.floor((rng() - 0.5) * 4000);
    const dives = 2 + Math.floor(rng() * 5);
    for (let i = 0; i < dives; i++) {
      cam.zoomAt(this.world.radix(cam.depth), this.W / 2, this.H / 2, this.W, this.H);
      cam.frac.x = 0.2 + rng() * 0.6;
      cam.frac.y = 0.2 + rng() * 0.6;
      cam.normalize(this.W, this.H);
    }
  }
}

/* ==========================================================================
 * 9. album sources — manifest assets, procedural demo, local files
 * ======================================================================== */

async function albumFromManifest(base, onProgress) {
  const res = await fetch(base + 'manifest.json', { cache: 'force-cache' });
  if (!res.ok) throw new Error('manifest ' + res.status);
  const m = await res.json();
  if (!m.photos || !m.photos.length) throw new Error('manifest has no photos');
  onProgress && onProgress(0.35, `manifest: ${m.photos.length} photos`);

  const n = m.photos.length;
  const ids = m.photos.map((p) => p.id);
  const aspect = Float32Array.from(m.photos.map((p) => p.aspect || 1));
  let G = 1,
    grid;
  if (m.colorIndex && m.colorIndex.file) {
    const buf = await fetch(base + m.colorIndex.file, { cache: 'force-cache' }).then((r) =>
      r.arrayBuffer()
    );
    G = m.colorIndex.grid || 1;
    grid = new Float32Array(buf, 0, Math.min(n * G * G * 3, buf.byteLength / 4));
    onProgress && onProgress(0.75, 'signature index loaded');
  } else {
    grid = new Float32Array(n * 3);
    m.photos.forEach((p, i) => {
      const c = p.colorSignature || [60, 0, 0];
      grid[i * 3] = c[0];
      grid[i * 3 + 1] = c[1];
      grid[i * 3 + 2] = c[2];
    });
  }

  const mipSizes = m.mipLevels || [256];
  const mipUrls = m.photos.map((p) => {
    const arr = [];
    for (let k = 0; k < mipSizes.length; k++) {
      const u = p.mips && (p.mips[String(k)] || p.mips[k]);
      arr.push(u ? base + u : null);
    }
    return arr;
  });
  const squareCrop = m.squareCrop !== false;

  let atlasUV = null,
    atlasSource = null;
  if (m.atlas && m.atlas.file) {
    atlasSource = { url: base + m.atlas.file };
    atlasUV = new Float32Array(n * 4);
    const aw = m.atlas.width,
      ah = m.atlas.height;
    m.photos.forEach((p, i) => {
      const r = p.atlas || { x: 0, y: 0, w: m.atlas.cell, h: m.atlas.cell };
      const inset = 0.5;
      atlasUV[i * 4] = (r.x + inset) / aw;
      atlasUV[i * 4 + 1] = (r.y + inset) / ah;
      atlasUV[i * 4 + 2] = (r.w - inset * 2) / aw;
      atlasUV[i * 4 + 3] = (r.h - inset * 2) / ah;
    });
  }
  const heroIdx = m.hero ? Math.max(0, ids.indexOf(m.hero)) : 0;

  return new Album({
    name: `album (${n} photos)`,
    n,
    ids,
    aspect,
    gridSize: G,
    grid,
    mipSizes,
    atlasSource,
    atlasUV,
    heroIdx,
    seedNum: hashString(String(m.albumSeed || 'seed')),
    getSource: (i, mip) => {
      let m2 = mip;
      while (m2 >= 0 && !mipUrls[i][m2]) m2--;
      if (m2 < 0) m2 = mipUrls[i].findIndex(Boolean);
      return { url: mipUrls[i][m2], crop: !squareCrop };
    },
  });
}

/** Procedural stand-in album so the page always works out of the box. */
function demoAlbum(count = 120) {
  const G = 8; // signature resolution caps how fine a mosaic can be
  const grid = new Float32Array(count * G * G * 3);
  const ids = [];
  const paint = (ctx, size, i) => {
    const rng = rngFrom(mix32(0x9e3779b9, i * 2654435761));
    const h0 = rng() * 360,
      h1 = h0 + 40 + rng() * 200;
    const g = ctx.createLinearGradient(0, 0, size * (0.3 + rng()), size);
    g.addColorStop(0, `hsl(${h0},${45 + rng() * 45}%,${28 + rng() * 40}%)`);
    g.addColorStop(1, `hsl(${h1},${40 + rng() * 50}%,${18 + rng() * 55}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const shapes = 2 + Math.floor(rng() * 5);
    for (let s = 0; s < shapes; s++) {
      ctx.globalAlpha = 0.18 + rng() * 0.5;
      ctx.fillStyle = `hsl(${(h0 + rng() * 360) % 360},${50 + rng() * 45}%,${25 + rng() * 55}%)`;
      const cx = rng() * size,
        cy = rng() * size,
        r = size * (0.08 + rng() * 0.42);
      ctx.beginPath();
      if (rng() < 0.55) ctx.arc(cx, cy, r, 0, Math.PI * 2);
      else ctx.rect(cx - r, cy - r * (0.3 + rng()), r * 2, r * (0.6 + rng() * 1.6));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.2,
      size / 2,
      size / 2,
      size * 0.75
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, size, size);
  };
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i++) {
    ids.push('demo' + String(i).padStart(3, '0'));
    scratch.width = scratch.height = 32;
    paint(sctx, 32, i);
    grid.set(signatureFromDrawable(scratch, G), i * G * G * 3);
  }
  // atlas of 16px cells
  const cell = 16,
    cols = Math.ceil(Math.sqrt(count));
  const atlas = document.createElement('canvas');
  atlas.width = cols * cell;
  atlas.height = Math.ceil(count / cols) * cell;
  const actx = atlas.getContext('2d');
  const atlasUV = new Float32Array(count * 4);
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d');
  tmp.width = tmp.height = cell;
  for (let i = 0; i < count; i++) {
    paint(tctx, cell, i);
    const cx = (i % cols) * cell,
      cy = Math.floor(i / cols) * cell;
    actx.drawImage(tmp, cx, cy);
    atlasUV[i * 4] = (cx + 0.5) / atlas.width;
    atlasUV[i * 4 + 1] = (cy + 0.5) / atlas.height;
    atlasUV[i * 4 + 2] = (cell - 1) / atlas.width;
    atlasUV[i * 4 + 3] = (cell - 1) / atlas.height;
  }
  const mipSizes = [32, 128, 384];
  return new Album({
    name: `procedural demo (${count} tiles)`,
    n: count,
    ids,
    gridSize: G,
    grid,
    mipSizes,
    atlasSource: { canvas: atlas },
    atlasUV,
    seedNum: hashString('procedural-demo-v1'),
    heroIdx: 0,
    getSource: (i, mip) => {
      const size = mipSizes[clamp(mip, 0, mipSizes.length - 1)];
      const c = document.createElement('canvas');
      c.width = c.height = size;
      paint(c.getContext('2d'), size, i);
      return { canvas: c };
    },
  });
}

/** Build an album directly from user-picked local files (no build step). */
async function albumFromFiles(files, onProgress) {
  const list = Array.from(files)
    .filter((f) => /^image\//.test(f.type))
    .slice(0, 900);
  if (!list.length) throw new Error('no images selected');
  const G = 8,
    cell = 16,
    THUMB = 128;
  const grid = new Float32Array(list.length * G * G * 3);
  const ids = [],
    urls = [],
    thumbs = [];
  const cols = Math.ceil(Math.sqrt(list.length));
  const atlas = document.createElement('canvas');
  atlas.width = cols * cell;
  atlas.height = Math.ceil(list.length / cols) * cell;
  const actx = atlas.getContext('2d');
  const atlasUV = new Float32Array(list.length * 4);

  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    let bmp;
    try {
      bmp = await createImageBitmap(f);
    } catch (e) {
      continue;
    }
    // Dense index: a file that failed to decode must not leave a hole, or
    // every later photo would read another photo's signature/atlas cell.
    const k = ids.length;
    ids.push(f.name);
    urls.push(URL.createObjectURL(f));
    grid.set(signatureFromDrawable(bmp, G), k * G * G * 3);
    const th = document.createElement('canvas');
    th.width = th.height = THUMB;
    drawCover(th.getContext('2d'), bmp, THUMB);
    thumbs.push(th);
    const cx = (k % cols) * cell,
      cy = Math.floor(k / cols) * cell;
    actx.drawImage(th, cx, cy, cell, cell);
    atlasUV[k * 4] = (cx + 0.5) / atlas.width;
    atlasUV[k * 4 + 1] = (cy + 0.5) / atlas.height;
    atlasUV[k * 4 + 2] = (cell - 1) / atlas.width;
    atlasUV[k * 4 + 3] = (cell - 1) / atlas.height;
    bmp.close && bmp.close();
    if (onProgress && i % 5 === 0) onProgress(i / list.length, `indexing ${i + 1}/${list.length}`);
  }
  const n = ids.length;
  if (!n) throw new Error('none of the selected files could be decoded');
  const mipSizes = [16, THUMB, 1600];
  return new Album({
    name: `local folder (${n} photos)`,
    n,
    ids,
    gridSize: G,
    grid: grid.subarray(0, n * G * G * 3),
    mipSizes,
    atlasSource: { canvas: atlas },
    atlasUV: atlasUV.subarray(0, n * 4),
    seedNum: hashString(ids.join('|')),
    heroIdx: 0,
    getSource: (i, mip) => {
      if (mip >= 2) return { url: urls[i], crop: true };
      if (mip === 1) return { canvas: thumbs[i] };
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      c.getContext('2d').drawImage(thumbs[i], 0, 0, 16, 16);
      return { canvas: c };
    },
  });
}

/* ==========================================================================
 * 10. input — pointer pan, wheel/pinch zoom, keyboard
 * ======================================================================== */

function bindInput(viewer, canvas, signal) {
  const pointers = new Map();
  let last = null,
    pinch = null;
  // Every listener is tied to `signal` so start() can detach the lot when
  // the album (and with it the canvas + viewer) is replaced.
  const on = (el, ev, fn, opts) => el.addEventListener(ev, fn, Object.assign({ signal }, opts));

  const pos = (e) => ({ x: e.clientX * viewer.dpr, y: e.clientY * viewer.dpr });

  on(canvas, 'pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    canvas.classList.add('dragging');
    viewer.dive = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
    }
    last = pos(e);
  });
  on(canvas, 'pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      viewer.camera.pan(mx - pinch.mx, my - pinch.my);
      if (pinch.d > 4 && d > 4) viewer.camera.zoomAt(d / pinch.d, mx, my, viewer.W, viewer.H);
      pinch = { d, mx, my };
    } else if (last) {
      viewer.camera.pan(p.x - last.x, p.y - last.y);
    }
    last = p;
    markDirty();
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    // Always re-anchor: `last` may belong to the pointer that just lifted,
    // and panning the surviving finger from there would make the view jump.
    last = null;
    if (!pointers.size) canvas.classList.remove('dragging');
  };
  on(canvas, 'pointerup', end);
  on(canvas, 'pointercancel', end);

  on(
    canvas,
    'wheel',
    (e) => {
      e.preventDefault();
      viewer.dive = 0;
      const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 400 : 1;
      const f = Math.exp(-e.deltaY * unit * 0.0018);
      viewer.camera.zoomAt(
        clamp(f, 0.25, 4),
        e.clientX * viewer.dpr,
        e.clientY * viewer.dpr,
        viewer.W,
        viewer.H
      );
      markDirty();
    },
    { passive: false }
  );

  on(canvas, 'dblclick', (e) => {
    viewer.camera.zoomAt(2.4, e.clientX * viewer.dpr, e.clientY * viewer.dpr, viewer.W, viewer.H);
  });

  const keys = new Set();
  on(window, 'keydown', (e) => {
    if (e.target.matches('input,select,textarea')) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === 'd') {
      viewer.dive = viewer.dive ? 0 : 0.25;
      toast(viewer.dive ? 'Diving…' : 'Dive stopped');
    }
    if (k === 'r') {
      viewer.camera.home();
      viewer.dive = 0;
      toast('View reset');
    }
    if (k === 'j') {
      viewer.jump();
      toast('Jumped');
    }
    if (k === 'h') document.getElementById('hud').classList.toggle('collapsed');
  });
  on(window, 'keyup', (e) => keys.delete(e.key.toLowerCase()));

  return function tickKeys(dt) {
    const cam = viewer.camera,
      sp = 700 * dt * viewer.dpr;
    if (keys.has('arrowleft')) cam.pan(sp, 0);
    if (keys.has('arrowright')) cam.pan(-sp, 0);
    if (keys.has('arrowup')) cam.pan(0, sp);
    if (keys.has('arrowdown')) cam.pan(0, -sp);
    if (keys.has('+') || keys.has('='))
      cam.zoomAt(Math.pow(3, dt), viewer.W / 2, viewer.H / 2, viewer.W, viewer.H);
    if (keys.has('-') || keys.has('_'))
      cam.zoomAt(Math.pow(1 / 3, dt), viewer.W / 2, viewer.H / 2, viewer.W, viewer.H);
  };
}

/* ==========================================================================
 * 11. hud — controls, stats, shareable view URLs
 * ======================================================================== */

const $ = (id) => document.getElementById(id);
let toastTimer = null;
/** Compact duration for the precalculation ETA. */
function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '…';
  if (s < 60) return Math.max(1, Math.round(s)) + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + Math.round(s - m * 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

let dirty = true;

function markDirty() {
  dirty = true;
}

function encodeView(viewer) {
  const c = viewer.camera,
    w = viewer.world;
  const digits = c.digits.map((d) => d.x + '.' + d.y).join('_');
  const p = new URLSearchParams();
  p.set('m', w.mode);
  if (w.mode === 'hero') p.set('h', String(w.heroIdx));
  p.set('s', w.seed); // the whole layout is a function of this
  p.set('g', gridValue());
  p.set('t', String(Math.round(CFG.tilePx)));
  p.set('n', String(Math.round(CFG.minTilePx)));
  p.set('q', String(CFG.maxQuads | 0));
  p.set('b', CFG.fadeSpan.toFixed(2));
  p.set('j', CFG.jitter.toFixed(2));
  // Both feed every child pick (they invalidate the world), so a link that
  // omitted them did not reproduce the layout it was taken from.
  p.set('st', CFG.structure.toFixed(2));
  p.set('dv', CFG.diversity.toFixed(2));
  p.set('c', CFG.tint.toFixed(2));
  p.set('r', c.root.x + '.' + c.root.y);
  if (digits) p.set('d', digits);
  p.set('f', c.frac.x.toFixed(5) + '.' + c.frac.y.toFixed(5));
  p.set('z', c.tilePx.toFixed(2));
  return '#' + p.toString();
}

function applyView(viewer, hash) {
  if (!hash || hash.length < 2) return false;
  try {
    const p = new URLSearchParams(hash.slice(1));
    const w = viewer.world,
      c = viewer.camera;
    if (p.has('g')) setGrid(p.get('g'));
    if (p.has('t')) CFG.tilePx = clamp(parseFloat(p.get('t')) || CFG.tilePx, 1, 200);
    if (p.has('n')) CFG.minTilePx = clamp(parseFloat(p.get('n')) || CFG.minTilePx, 2, 64);
    if (p.has('q')) CFG.maxQuads = clamp(parseInt(p.get('q'), 10) || CFG.maxQuads, 2000, 40000);
    if (p.has('b')) CFG.fadeSpan = clamp(parseFloat(p.get('b')) || CFG.fadeSpan, 1.05, 5);
    if (p.has('j')) CFG.jitter = clamp(parseFloat(p.get('j')) || 0, 0, 1);
    if (p.has('st')) CFG.structure = clamp(parseFloat(p.get('st')) || 0, 0, 1);
    if (p.has('dv')) CFG.diversity = clamp(parseFloat(p.get('dv')) || 0, 0, 1);
    if (p.has('c')) CFG.tint = clamp(parseFloat(p.get('c')) || 0, 0, 1);
    w.configure({
      mode: p.get('m') === 'hero' ? 'hero' : 'album',
      heroIdx: p.has('h') ? parseInt(p.get('h'), 10) : undefined,
      seed: p.has('s') ? p.get('s') : undefined,
      invalidate: true,
    });
    const r = (p.get('r') || '0.0').split('.');
    c.root.x = parseInt(r[0], 10) | 0;
    c.root.y = parseInt(r[1], 10) | 0;
    c.digits = (p.get('d') || '')
      .split('_')
      .filter(Boolean)
      .map((t) => {
        const [a, b] = t.split('.');
        return { x: parseInt(a, 10) | 0, y: parseInt(b, 10) | 0 };
      });
    // "x.xxxxx.y.yyyyy" — both fractions are non-negative after normalize().
    const fs2 = (p.get('f') || '').split('.');
    if (fs2.length === 4) {
      c.frac.x = parseFloat(fs2[0] + '.' + fs2[1]);
      c.frac.y = parseFloat(fs2[2] + '.' + fs2[3]);
    }
    c.tilePx = parseFloat(p.get('z')) || 700;
    return true;
  } catch (e) {
    return false;
  }
}

function bindHud(viewer, signal) {
  const w = viewer.world,
    album = viewer.album;
  // All listeners are tied to `signal` so a later start() can detach them
  // instead of stacking a second set on top of the first.
  const on = (el, ev, fn) => el.addEventListener(ev, fn, { signal });
  $('albumLine').textContent = album.name;
  /* --- generic slider helper: value comes from CFG, never from markup ---- */
  const slider = (id, get, set, fmt) => {
    const el = $(id),
      out = $(id + 'Val');
    if (!el) return;
    const show = () => {
      if (out) out.textContent = fmt(get());
    };
    el.value = String(get());
    show();
    on(el, 'input', () => {
      set(+el.value);
      show();
      markDirty();
    });
  };
  /* --- mosaic grid: how many sub-images recompose each photo ------------- */
  const gridSel = $('grid');
  gridSel.textContent = ''; // start() may re-bind for a replacement album
  AUTO_PRESETS.forEach((preset, k) => {
    const o = document.createElement('option');
    o.value = 'auto:' + k;
    o.textContent = preset.label;
    gridSel.appendChild(o);
  });
  // Geometric ladder: each step is 2^(1/3), so three steps double the grid.
  const addGrid = (n) => {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = `${n} × ${n} — ${(n * n).toLocaleString()} sub-images`;
    gridSel.appendChild(o);
  };
  GRID_STEPS.forEach(addGrid);
  if (CFG.radix >= 2 && GRID_STEPS.indexOf(CFG.radix) < 0) addGrid(CFG.radix);
  gridSel.value = gridValue();
  on(gridSel, 'change', () => {
    setGrid(gridSel.value);
    w.configure({ invalidate: true }); // radix feeds every child pick
    viewer.camera.clampDigits();
    viewer.camera.normalize(viewer.W, viewer.H);
    toast(gridLabel());
    markDirty();
  });
  /* --- layout seed: the single value the whole infinite fractal derives
           from. Same seed + same album ⇒ identical layout, forever. ------- */
  const seedIn = $('seed');
  const applySeed = (v) => {
    w.configure({ seed: v });
    viewer.camera.clampDigits();
    viewer.camera.normalize(viewer.W, viewer.H);
    toast('Seed “' + w.seed + '”');
    markDirty();
  };
  if (seedIn) {
    seedIn.value = w.seed;
    on(seedIn, 'change', () => applySeed(seedIn.value));
    on(seedIn, 'keydown', (e) => {
      if (e.key === 'Enter') {
        applySeed(seedIn.value);
        seedIn.blur();
      }
    });
  }

  const heroSel = $('hero');
  heroSel.textContent = '';
  const cap = Math.min(album.n, 400);
  for (let i = 0; i < cap; i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = album.label(i);
    heroSel.appendChild(o);
  }
  heroSel.value = String(clamp(w.heroIdx, 0, cap - 1));

  const syncMode = () => {
    $('heroRow').style.display = $('mode').value === 'hero' ? 'flex' : 'none';
  };
  $('mode').value = w.mode;
  syncMode();

  on($('mode'), 'change', () => {
    w.configure({ mode: $('mode').value, heroIdx: parseInt(heroSel.value, 10) });
    syncMode();
    markDirty();
  });
  on(heroSel, 'change', () => {
    w.configure({ heroIdx: parseInt(heroSel.value, 10) });
    markDirty();
  });
  slider(
    'detail',
    () => Math.round(CFG.tilePx),
    (v) => {
      CFG.tilePx = v;
    },
    (v) => v + 'px'
  );
  /* --- LOD floor: the smallest a subdivided tile is allowed to get -------
       This is the knob that makes a fine partition affordable: the walk stops
       descending here regardless of how small `detail` is. --------------- */
  slider(
    'lod',
    () => Math.round(CFG.minTilePx),
    (v) => {
      CFG.minTilePx = v;
    },
    (v) => v + 'px'
  );
  /* --- explicit per-frame quad budget the adaptive LOD converges on ----- */
  slider(
    'budget',
    () => Math.round(CFG.maxQuads / 500),
    (v) => {
      CFG.maxQuads = v * 500;
    },
    (v) => (v / 2).toFixed(1) + 'k'
  );
  slider(
    'fade',
    () => Math.round(CFG.fadeSpan * 100),
    (v) => {
      CFG.fadeSpan = v / 100;
    },
    (v) => (v / 100).toFixed(2) + '×'
  );
  slider(
    'jitter',
    () => Math.round(CFG.jitter * 100),
    (v) => {
      CFG.jitter = v / 100;
      w.configure({ invalidate: true });
    },
    (v) => v + '%'
  );
  slider(
    'structure',
    () => Math.round(CFG.structure * 100),
    (v) => {
      CFG.structure = v / 100;
      w.configure({ invalidate: true });
    },
    (v) => v + '%'
  );
  slider(
    'diversity',
    () => Math.round(CFG.diversity * 100),
    (v) => {
      CFG.diversity = v / 100;
      w.configure({ invalidate: true });
    },
    (v) => v + '%'
  );
  /* --- colour correction: pull each sub-image onto its target colour ----- */
  slider(
    'tint',
    () => Math.round(CFG.tint * 100),
    (v) => {
      CFG.tint = v / 100;
    },
    (v) => v + '%'
  );
  on($('btnReset'), 'click', () => {
    viewer.camera.home();
    viewer.dive = 0;
    toast('View reset');
  });
  on($('btnRandom'), 'click', () => {
    viewer.jump();
    toast('Jumped');
  });
  on($('btnShuffle'), 'click', () => {
    const s = Math.random().toString(36).slice(2, 10);
    if (seedIn) seedIn.value = s;
    applySeed(s);
  });
  on($('btnDive'), 'click', () => {
    viewer.dive = viewer.dive ? 0 : 0.25;
    toast(viewer.dive ? 'Diving…' : 'Dive stopped');
  });
  /* --- precalculate every photo's mosaic at the current grid ------------- */
  const precalcBtn = $('btnPrecalc');
  if (precalcBtn)
    precalcBtn.onclick = () => {
      if (viewer.batch && !viewer.batch.finished) {
        viewer.batch.cancel();
        toast('Precalculation cancelled');
        return;
      }
      const r = CFG.radix >= 2 ? CFG.radix : w.radix(0);
      const b = viewer.precalc(r);
      toast(
        b.fits < album.n
          ? `Precalculating ${r}×${r} — cache holds ~${b.fits} of ${album.n}`
          : `Precalculating ${r}×${r} for ${album.n} photos`
      );
    };
  const cancelBtn = $('calcCancel');
  if (cancelBtn)
    cancelBtn.onclick = () => {
      if (viewer.batch) viewer.batch.cancel();
      toast('Precalculation cancelled');
    };
  on($('btnLink'), 'click', async () => {
    const url = location.origin + location.pathname + encodeView(viewer);
    try {
      await navigator.clipboard.writeText(url);
      toast('View link copied');
    } catch (e) {
      location.hash = encodeView(viewer);
      toast('View link in address bar');
    }
  });
}

function updateHud(viewer) {
  const m = viewer.camera.metrics(viewer.W, viewer.H);
  const r = viewer.world.radix(m.depth);
  $('sDepth').textContent = m.depth;
  $('sZoom').textContent =
    m.log10 < 4
      ? Math.round(Math.pow(10, m.log10)).toLocaleString() + '×'
      : '10^' + m.log10.toFixed(1) + '×';
  $('sGrid').textContent = r + '×' + r;
  $('sPer').textContent = r * r;
  $('sQuads').textContent = viewer.stats.quads;
  $('sTiles').textContent = viewer.stats.tiles;
  $('sTex').textContent = viewer.pool.residentCount;
  $('sFps').textContent = viewer.stats.fps;
  const sl = $('sLod');
  if (sl) sl.textContent = (viewer.stats.lod || 1).toFixed(2) + '×';
  $('dNum').textContent = m.depth;
  $('depth').style.background =
    `conic-gradient(var(--accent) ${m.frac}turn, rgba(255,255,255,.07) ${m.frac}turn)`;
}

/**
 * The "calculating" splash. Two sources of work feed it: the background
 * subdivision of whatever is on screen (no cancel — the tile simply stays
 * whole until it finishes) and the explicit full-album precalculation
 * (cancellable, with an ETA from the measured cell rate).
 */
let calcShown = false;

function updateCalc(viewer) {
  const el = $('calc');
  if (!el) return;
  const b = viewer.batch;
  let show = false,
    frac = 0,
    msg = '',
    note = '',
    cancel = false;
  if (b && !b.finished) {
    show = true;
    cancel = true;
    frac = b.frac();
    msg = b.waiting
      ? `Loading full-resolution pixels — photo ${Math.min(b.i + 1, b.n)}/${b.n}`
      : `Precalculating ${b.r}×${b.r} — photo ${Math.min(b.i + 1, b.n)}/${b.n}`;
    const e = b.eta();
    note = isFinite(e) ? `about ${fmtTime(e)} left` : 'estimating…';
  } else {
    const p = viewer.world.buildProgress();
    if (p.total >= (CFG.buildSplashCells | 0) && p.done < p.total) {
      show = true;
      frac = p.done / p.total;
      msg = `Calculating subdivision${p.r ? ` — ${p.r}×${p.r}` : ''}…`;
      note = (p.total - p.done).toLocaleString() + ' sub-images to place';
    }
  }
  if (show) {
    el.classList.add('show');
    $('calcMsg').textContent = msg;
    $('calcPct').textContent = Math.round(frac * 100) + '%';
    $('calcBar').firstElementChild.style.width = (frac * 100).toFixed(1) + '%';
    $('calcEta').textContent = note;
    $('calcCancel').style.display = cancel ? 'inline-block' : 'none';
  } else if (calcShown) {
    el.classList.remove('show');
  }
  calcShown = show;
}

/* ==========================================================================
 * 12. boot
 * ======================================================================== */

let viewer = null,
  tickKeys = () => {},
  bindings = null; // AbortController owning the current viewer's DOM listeners

function setBoot(pct, msg) {
  $('bar').firstElementChild.style.width = Math.round(clamp(pct, 0, 1) * 100) + '%';
  if (msg) $('bootMsg').textContent = msg;
}

function hideBoot() {
  $('boot').classList.add('hide');
}

function start(album) {
  // Every listener of the previous viewer hangs off one AbortController, so
  // replacing the album cannot stack duplicate HUD/keyboard handlers (two
  // keydown handlers toggled "dive" twice, i.e. not at all, and the grid /
  // hero <select>s grew a second copy of every option).
  if (bindings) bindings.abort();
  bindings = new AbortController();
  if (viewer) {
    // Replacing the album: release the old GL context and swap in a fresh
    // canvas. Use the viewer's canvas, not the boot-time element — after
    // one swap that one is already detached and replaceWith() is a no-op.
    if (viewer.batch) viewer.batch.cancel();
    const lose = viewer.renderer.gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    const old = viewer.canvas;
    old.replaceWith(old.cloneNode(false));
    viewer = null;
    tickKeys = () => {};
  }
  const el = $('stage');
  try {
    viewer = new Viewer(el, album);
  } catch (e) {
    setBoot(1, e.message);
    return;
  }
  applyView(viewer, location.hash);
  bindHud(viewer, bindings.signal);
  tickKeys = bindInput(viewer, el, bindings.signal);
  hideBoot();
  toast('Zoom in — every photo becomes a mosaic');
}

let lastT = performance.now(),
  hudAcc = 0,
  hashAcc = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (viewer) {
    tickKeys(dt);
    viewer.frame(dt);
    hudAcc += dt;
    if (hudAcc > 0.15) {
      updateHud(viewer);
      updateCalc(viewer);
      hudAcc = 0;
    }
    hashAcc += dt;
    if (hashAcc > 1.2) {
      hashAcc = 0;
      const h = encodeView(viewer);
      if (h !== location.hash) history.replaceState(null, '', h);
    }
  }
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

window.addEventListener('resize', () => {
  if (viewer) viewer.resize();
  markDirty();
});

$('pick').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  $('boot').classList.remove('hide');
  $('bootExtra').style.display = 'none';
  setBoot(0.05, 'Indexing local photos…');
  try {
    const album = await albumFromFiles(files, (p, msg) => setBoot(0.05 + p * 0.9, msg));
    setBoot(1, 'ready');
    location.hash = '';
    start(album);
  } catch (err) {
    setBoot(1, 'Could not read those files: ' + err.message);
    $('bootExtra').style.display = 'block';
  }
});

(async function bootstrap() {
  setBoot(0.1, 'Looking for assets/manifest.json…');
  try {
    const album = await albumFromManifest(CFG.assetsBase, setBoot);
    setBoot(1, 'ready');
    start(album);
  } catch (err) {
    setBoot(0.6, 'Falling back to the procedural demo album.');
    $('bootExtra').style.display = 'block';
    const demo = demoAlbum(120);
    setBoot(1, 'Demo album ready.');
    $('bootGo').addEventListener('click', () => start(demo), { once: true });
    // auto-start after a moment so the page is never a dead end
    setTimeout(() => {
      if (!viewer) start(demo);
    }, 4000);
  }
})();
