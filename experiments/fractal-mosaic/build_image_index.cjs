#!/usr/bin/env node
/**
 * build_image_index.js — offline preprocessing pipeline for the
 * Recursive Photomosaic Fractal Viewer (see idea.md §4.1, §5).
 *
 * Produces a directory of static assets:
 *
 *   assets/
 *     manifest.json          photo table + atlas/index descriptors
 *     album-seed.txt         deterministic album seed (hex)
 *     index-color.bin        Float32 CIELAB grid signatures (n × G*G*3)
 *     thumbnails-atlas.jpg   packed atlas of the smallest mip
 *     photos/<id>/<mip>.jpg  square-cropped mip pyramid
 *     .build-cache.json      incremental build cache
 *
 * Usage:
 *   node build_image_index.js --input ./photos --out ./assets
 *
 * Options:
 *   --input <dir>        source directory (recursive)         [photos]
 *   --out <dir>          output asset directory               [assets]
 *   --sizes 16,64,256,1024   mip ladder (square, long edge)
  *   --grid <n>           color-signature grid resolution      [8]
 *   --quality <n>        JPEG/WebP quality                    [78]
 *   --format jpg|webp|avif                                    [jpg]
 *   --position centre|attention|entropy   crop gravity        [centre]
 *   --hero <file>        hero image for hero-driven mode      [none]
 *   --limit <n>          only process the first n photos      [all]
 *   --concurrency <n>    parallel workers                     [cpus-1]
 *   --force              ignore cache, re-encode everything
 *   --quiet
 *
 * Requires: npm i sharp
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('\n[build_image_index] Missing dependency "sharp".\n' +
    '  Install it with:  npm i sharp\n');
  process.exit(1);
}

const VERSION = '1.0.0';
const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff', '.bmp', '.gif'
]);

/* ------------------------------------------------------------------ *
 * CLI parsing
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const cfg = {
    input: 'photos',
    out: 'assets',
    sizes: [16, 64, 256, 1024],
    grid: 8,
    quality: 78,
    format: 'jpg',
    position: 'centre',
    hero: null,
    limit: 0,
    concurrency: Math.max(2, os.cpus().length - 1),
    force: false,
    quiet: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--input': case '-i': cfg.input = next(); break;
      case '--out': case '-o': cfg.out = next(); break;
      case '--sizes': cfg.sizes = next().split(',').map(s => parseInt(s, 10)).filter(Boolean); break;
      // A coarse grid is the hard ceiling on how finely a photo can be
      // partitioned: every sub-tile inside one grid cell gets the same target.
      case '--grid': cfg.grid = Math.max(1, parseInt(next(), 10) || 8); break;
      case '--quality': cfg.quality = Math.max(1, Math.min(100, parseInt(next(), 10) || 78)); break;
      case '--format': cfg.format = next().toLowerCase(); break;
      case '--position': cfg.position = next(); break;
      case '--hero': cfg.hero = next(); break;
      case '--limit': cfg.limit = parseInt(next(), 10) || 0; break;
      case '--concurrency': cfg.concurrency = Math.max(1, parseInt(next(), 10) || 4); break;
      case '--force': cfg.force = true; break;
      case '--quiet': cfg.quiet = true; break;
      case '--help': case '-h': usage(); process.exit(0); break;
      default:
        console.error('Unknown option: ' + a);
        usage();
        process.exit(2);
    }
  }
  cfg.sizes = Array.from(new Set(cfg.sizes)).sort((x, y) => x - y);
  if (!cfg.sizes.length) cfg.sizes = [16, 64, 256, 1024];
  if (!['jpg', 'webp', 'avif'].includes(cfg.format)) cfg.format = 'jpg';
  return cfg;
}

function usage() {
  console.log(fs.readFileSync(__filename, 'utf8')
    .split('*/')[0].replace(/^\/\*\*?/, '').replace(/^\s*\*ceholder/gm, '')
    .split('\n').map(l => l.replace(/^\s*\*ted?/, '').replace(/^\s*\* ?/, '')).join('\n'));
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (IMAGE_EXT.has(path.extname(e.name).toLowerCase())) yield p;
  }
}

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function round4(v) { return Math.round(v * 10000) / 10000; }

async function pool(items, n, fn) {
  let cursor = 0;
  const workers = [];
  for (let k = 0; k < n; k++) {
    workers.push((async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= items.length) return;
        try { await fn(items[idx], idx); }
        catch (err) {
          console.error('\n  ! failed: ' + items[idx] + ' — ' + (err && err.message));
        }
      }
    })());
  }
  await Promise.all(workers);
}

/* ------------------------------------------------------------------ *
 * Color science: sRGB (0..255) -> linear -> XYZ(D65) -> CIELAB
 * ------------------------------------------------------------------ */

const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    t[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return t;
})();

function linearRgbToLab(r, g, b, out, off) {
  // linear sRGB -> XYZ (D65)
  const X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const Y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const Z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const f = (t) => t > 0.008856451679 ? Math.cbrt(t) : (7.787037037 * t + 16 / 116);
  const fx = f(X / xn), fy = f(Y / yn), fz = f(Z / zn);
  out[off] = 116 * fy - 16;          // L  0..100
  out[off + 1] = 500 * (fx - fy);    // a  ~-100..100
  out[off + 2] = 200 * (fy - fz);    // b  ~-100..100
}

/**
 * Compute a G×G CIELAB grid signature from a square-cropped sample of
 * the image. Averaging happens in linear light, then converts to Lab.
 */
async function gridSignature(file, G, position) {
  const S = G * 4; // supersample so each grid cell averages 16 pixels
  const { data } = await sharp(file)
    .rotate()
    .resize(S, S, { fit: 'cover', position })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const grid = new Float32Array(G * G * 3);
  const bs = S / G;
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      let lr = 0, lg = 0, lb = 0, count = 0;
      for (let py = gy * bs; py < (gy + 1) * bs; py++) {
        let o = (py * S + gx * bs) * 3;
        for (let px = 0; px < bs; px++, o += 3) {
          lr += SRGB_TO_LINEAR[data[o]];
          lg += SRGB_TO_LINEAR[data[o + 1]];
          lb += SRGB_TO_LINEAR[data[o + 2]];
          count++;
        }
      }
      linearRgbToLab(lr / count, lg / count, lb / count, grid, (gy * G + gx) * 3);
    }
  }
  return grid;
}

function meanOfGrid(grid, G) {
  let L = 0, A = 0, B = 0;
  const cells = G * G;
  for (let i = 0; i < cells; i++) { L += grid[i * 3]; A += grid[i * 3 + 1]; B += grid[i * 3 + 2]; }
  return [L / cells, A / cells, B / cells];
}

/* ------------------------------------------------------------------ *
 * Encoding
 * ------------------------------------------------------------------ */

function encoderFor(pipeline, format, quality) {
  if (format === 'webp') return pipeline.webp({ quality });
  if (format === 'avif') return pipeline.avif({ quality });
  return pipeline.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' });
}

async function writeMips(file, id, cfg) {
  const ext = cfg.format === 'jpg' ? 'jpg' : cfg.format;
  const dir = path.join(cfg.out, 'photos', id);
  mkdirp(dir);
  const mips = {};
  for (let i = 0; i < cfg.sizes.length; i++) {
    const s = cfg.sizes[i];
    const rel = `photos/${id}/${i}.${ext}`;
    const dest = path.join(cfg.out, rel);
    if (cfg.force || !fs.existsSync(dest)) {
      const p = sharp(file).rotate().resize(s, s, { fit: 'cover', position: cfg.position });
      await encoderFor(p, cfg.format, cfg.quality).toFile(dest);
    }
    mips[String(i)] = rel;
  }
  return mips;
}

async function atlasCell(file, cell, position) {
  const { data } = await sharp(file)
    .rotate()
    .resize(cell, cell, { fit: 'cover', position })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data; // cell*cell*3
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const cfg = parseArgs(process.argv);
  const log = (...a) => { if (!cfg.quiet) console.log(...a); };

  if (!fs.existsSync(cfg.input)) {
    console.error(`[build_image_index] input directory not found: ${cfg.input}`);
    process.exit(1);
  }
  mkdirp(cfg.out);

  let files = Array.from(walk(cfg.input));
  if (cfg.hero) {
    const heroAbs = path.resolve(cfg.hero);
    files = files.filter(f => path.resolve(f) !== heroAbs);
    files.unshift(cfg.hero);
  }
  if (cfg.limit > 0) files = files.slice(0, cfg.limit + (cfg.hero ? 1 : 0));

  if (!files.length) {
    console.error(`[build_image_index] no images found under ${cfg.input}`);
    process.exit(1);
  }

  log(`[build_image_index] v${VERSION}`);
  log(`  input       : ${cfg.input} (${files.length} images)`);
  log(`  output      : ${cfg.out}`);
  log(`  mip ladder  : ${cfg.sizes.join(', ')} px (square crop, ${cfg.format})`);
  log(`  grid sig.   : ${cfg.grid}x${cfg.grid} CIELAB`);
  log(`  concurrency : ${cfg.concurrency}`);

  /* ---- incremental cache -------------------------------------- */
  const cachePath = path.join(cfg.out, '.build-cache.json');
  let cache = {};
  if (!cfg.force && fs.existsSync(cachePath)) {
    try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) { cache = {}; }
  }
  const cacheSalt = `${VERSION}|${cfg.sizes.join(',')}|${cfg.grid}|${cfg.format}|${cfg.quality}|${cfg.position}`;
  const newCache = {};

  const cell = cfg.sizes[0];
  const records = new Array(files.length).fill(null);
  let done = 0;

  await pool(files, cfg.concurrency, async (file, idx) => {
    const rel = path.relative(cfg.input, file) || path.basename(file);
    const st = fs.statSync(file);
    const cacheKey = `${rel}|${st.mtimeMs}|${st.size}|${cacheSalt}`;
    const hit = cache[cacheKey];

    let rec;
    if (hit && !cfg.force) {
      rec = {
        id: hit.id,
        file: rel,
        aspect: hit.aspect,
        timestamp: hit.timestamp,
        grid: Float32Array.from(hit.grid),
        atlas: Buffer.from(hit.atlas, 'base64'),
        mips: hit.mips,
        hero: !!(cfg.hero && idx === 0)
      };
      // make sure the mip files still exist
      for (const k of Object.keys(rec.mips)) {
        if (!fs.existsSync(path.join(cfg.out, rec.mips[k]))) {
          rec.mips = await writeMips(file, rec.id, cfg);
          break;
        }
      }
    } else {
      const id = 'p' + sha1(rel).slice(0, 10);
      const meta = await sharp(file).metadata();
      const rotated = (meta.orientation || 0) >= 5;
      const w = rotated ? meta.height : meta.width;
      const h = rotated ? meta.width : meta.height;
      const grid = await gridSignature(file, cfg.grid, cfg.position);
      const atlas = await atlasCell(file, cell, cfg.position);
      const mips = await writeMips(file, id, cfg);
      rec = {
        id, file: rel,
        aspect: round4((w || 1) / (h || 1)),
        timestamp: new Date(st.mtime).toISOString(),
        grid, atlas, mips,
        hero: !!(cfg.hero && idx === 0)
      };
    }

    newCache[cacheKey] = {
      id: rec.id, aspect: rec.aspect, timestamp: rec.timestamp,
      grid: Array.from(rec.grid, round4),
      atlas: rec.atlas.toString('base64'),
      mips: rec.mips
    };
    records[idx] = rec;
    done++;
    if (!cfg.quiet && (done % 10 === 0 || done === files.length)) {
      process.stdout.write(`\r  processed ${done}/${files.length}   `);
    }
  });
  if (!cfg.quiet) process.stdout.write('\n');

  const photos = records.filter(Boolean);
  if (!photos.length) {
    console.error('[build_image_index] nothing processed successfully.');
    process.exit(1);
  }

  /* ---- thumbnail atlas ---------------------------------------- */
  const n = photos.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const aw = cols * cell, ah = rows * cell;
  const atlasBuf = Buffer.alloc(aw * ah * 3, 16);
  photos.forEach((p, i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    for (let y = 0; y < cell; y++) {
      const src = y * cell * 3;
      const dst = ((cy + y) * aw + cx) * 3;
      p.atlas.copy(atlasBuf, dst, src, src + cell * 3);
    }
    p.atlasRect = { x: cx, y: cy, w: cell, h: cell };
  });
  const atlasFile = 'thumbnails-atlas.jpg';
  await sharp(atlasBuf, { raw: { width: aw, height: ah, channels: 3 } })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(path.join(cfg.out, atlasFile));
  log(`  atlas       : ${atlasFile} (${aw}x${ah}, ${cell}px cells)`);

  /* ---- color / signature index (binary) ----------------------- */
  const G = cfg.grid;
  const stride = G * G * 3;
  const indexArr = new Float32Array(n * stride);
  photos.forEach((p, i) => indexArr.set(p.grid, i * stride));
  const indexFile = 'index-color.bin';
  fs.writeFileSync(path.join(cfg.out, indexFile), Buffer.from(indexArr.buffer));
  log(`  index       : ${indexFile} (${n} rows x ${stride} float32)`);

  /* ---- album seed --------------------------------------------- */
  const seedMaterial = JSON.stringify({
    v: VERSION, sizes: cfg.sizes, grid: G, format: cfg.format,
    photos: photos.map(p => [p.id, Array.from(p.grid, v => Math.round(v * 100))])
  });
  const albumSeed = sha256(seedMaterial).slice(0, 32);
  fs.writeFileSync(path.join(cfg.out, 'album-seed.txt'), albumSeed + '\n');

  /* ---- manifest ------------------------------------------------ */
  const manifest = {
    version: VERSION,
    albumSeed,
    generatedAt: new Date().toISOString(),
    mipLevels: cfg.sizes,
    format: cfg.format,
    squareCrop: true,
    colorSpace: 'cielab',
    hero: (photos.find(p => p.hero) || {}).id || null,
    atlas: { file: atlasFile, width: aw, height: ah, cell, cols, rows },
    colorIndex: {
      file: indexFile, rows: n, grid: G, channels: 3,
      space: 'cielab', dtype: 'float32', layout: 'row-major'
    },
    photos: photos.map((p, i) => ({
      id: p.id,
      file: p.file,
      aspect: p.aspect,
      indexRow: i,
      colorSignature: meanOfGrid(p.grid, G).map(round4),
      timestamp: p.timestamp,
      atlas: p.atlasRect,
      mips: p.mips
    }))
  };
  fs.writeFileSync(path.join(cfg.out, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(cachePath, JSON.stringify(newCache));

  log(`  manifest    : manifest.json`);
  log(`  album seed  : ${albumSeed}`);
  log(`\nDone. Serve the folder containing index.html + ${cfg.out}/ over HTTP, e.g.:`);
  log(`  npx serve .        # then open http://localhost:3000\n`);
}

main().catch(err => {
  console.error('\n[build_image_index] fatal:', err);
  process.exit(1);
});