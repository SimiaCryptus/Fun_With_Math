// main.js — bootstrap: config panel, engine runner, camera, renderer, overlays,
// top-K panel, exports, permalinks. The viewer is the contract; the in-browser
// engine is an accelerator (§5.1) — it never mutates a certified artifact (§5.7).
import { Viewport } from './viewport.js';
import { Renderer } from './renderer/canvas2d.js';
import { legendCss } from './renderer/colormap.js';
import { EngineRunner, PointStore } from './engine/runner.js';
import { normalizeConfig } from './sieve.js';
import { verify, verifyBruteForce } from './verify.js';
import { Hud } from './ui/hud.js';
import { Inspector } from './ui/inspector.js';
import { TopKPanel } from './ui/topk-panel.js';
import { bindShortcuts } from './ui/shortcuts.js';
import { runSelfTest } from './selftest.js';
import { configHash, pointsHash } from './util/sha256.js';
import * as EX from './data/export.js';
import { createLogger, history as logHistory } from './util/log.js';

const log = createLogger('main');

/** Required element: a missing id is a broken build, not a runtime condition. */
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`main: required element #${id} is missing from index.html`);
  return el;
};

function fail(where, err) {
  const msg = err && err.message ? err.message : String(err);
  log.error(`${where}: ${msg}`, err && err.stack ? err.stack : '');
  const el = document.getElementById('engine-status');
  if (el) {
    el.className = 'status err';
    el.textContent = `${where} FAILED: ${msg}`;
  }
}

/** Wrap a UI handler so a throw is reported instead of silently killing the button. */
const guard =
  (where, fn) =>
  (...args) => {
    try {
      const r = fn(...args);
      if (r && typeof r.catch === 'function') r.catch((e) => fail(where, e));
      return r;
    } catch (e) {
      fail(where, e);
    }
  };

window.addEventListener('error', (e) => fail('uncaught error', e.error || new Error(e.message)));
window.addEventListener('unhandledrejection', (e) => fail('unhandled rejection', e.reason));
// Handy from the console when filing a bug: copy(no3sieveLog())
window.no3sieveLog = () =>
  logHistory()
    .map((r) => `${r.lvl}\t${r.ns}\t${r.msg}`)
    .join('\n');

const canvas = $('view');
const vp = new Viewport();
const renderer = new Renderer(canvas);
const store = new PointStore();
const hud = new Hud($('hud'));
const inspector = new Inspector($('inspector'));

const opts = {
  grid: true,
  rings: true,
  unknown: true,
  density: true,
  dead: true,
  horizonW: 0, // mirrored from cfg so layers/inspector can stay honest
  s: 16,
  norm: 's',
  alpha: 0.7,
  selection: null,
  hover: null,
};
let cfg = normalizeConfig({ rMax: 256 });
let ringLog = [];
let dirty = true;

const runner = new EngineRunner(store, {
  ring(rep) {
    ringLog.push({ r: rep.r, k: rep.k, added: rep.added });
    if (ringLog.length > 65536) ringLog.splice(0, ringLog.length - 65536); // bound the NDJSON buffer
    renderer.invalidateOverlay();
    dirty = true;
  },
  done() {
    renderer.invalidateOverlay();
    dirty = true;
  },
  status(s) {
    const el = document.getElementById('engine-status');
    if (el) {
      el.className = 'status';
      el.textContent = s;
    }
  },
});

// ---------------------------------------------------------------- rendering loop
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return; // display:none / detached
  canvas.width = Math.max(1, Math.floor(r.width * dpr));
  canvas.height = Math.max(1, Math.floor(r.height * dpr));
  renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vp.resize(r.width, r.height, dpr);
  renderer.invalidateOverlay();
  dirty = true;
}

if (typeof ResizeObserver === 'function')
  new ResizeObserver(guard('resize', resize)).observe(canvas);
else window.addEventListener('resize', guard('resize', resize));

let frameErrors = 0;

function frame() {
  try {
    hud.frame();
    if (dirty || runner.running) {
      const ps = store.snapshot();
      ps.config = cfg;
      ps.has = (x, y) => store.has(x, y);
      renderer.ctx.save();
      renderer.draw(vp, ps, opts);
      renderer.ctx.restore();
      hud.render(vp, ps, runner, renderer, opts);
      inspector.render(opts.hover, ps, opts);
      dirty = false;
    }
    frameErrors = 0;
  } catch (e) {
    if (++frameErrors <= 3) fail('render', e);
    if (frameErrors > 120) {
      log.error('render loop disabled after 120 consecutive failures');
      return;
    }
    try {
      renderer.ctx.restore();
    } catch (_) {}
  }
  requestAnimationFrame(frame);
}

// -------------------------------------------------------------------- pan / zoom
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    log.debug('setPointerCapture failed (harmless):', err);
  }
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => {
  drag = null;
});
canvas.addEventListener('pointercancel', () => {
  drag = null;
});
canvas.addEventListener('pointerleave', () => {
  opts.hover = null;
  dirty = true;
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  opts.hover = vp.cellAt(e.clientX - r.left, e.clientY - r.top);
  if (drag) {
    vp.panPixels(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
    renderer.invalidateOverlay();
  }
  dirty = true;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    vp.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    renderer.invalidateOverlay();
    dirty = true;
    pushPermalink();
  },
  { passive: false }
);

bindShortcuts(window, {
  pan(dx, dy) {
    vp.panPixels(-dx, -dy);
    renderer.invalidateOverlay();
    dirty = true;
  },
  zoom(f) {
    vp.zoomAt(vp.w / 2, vp.h / 2, f);
    renderer.invalidateOverlay();
    dirty = true;
  },
  fit() {
    vp.fitRing(Math.max(1, store.rGen));
    renderer.invalidateOverlay();
    dirty = true;
  },
  toggle(k) {
    opts[k] = !opts[k];
    const map = { grid: 'ov-grid', density: 'ov-density', rings: 'ov-rings', dead: 'ov-dead' };
    if (map[k]) $(map[k]).checked = opts[k];
    renderer.invalidateOverlay();
    dirty = true;
  },
  topk(d) {
    topk.step(d);
  },
});

// ------------------------------------------------------------------ config panel
function readConfig() {
  const raw = $('cfg-rmax').value;
  const rMax = Number(raw);
  if (!Number.isFinite(rMax) || rMax < 0)
    throw new RangeError(`R_max: "${raw}" is not a non-negative number`);
  if (rMax > 2048) log.warn(`R_max=${rMax}: expect a multi-second run and a large event pool`);
  const wRaw = $('cfg-w').value;
  const horizonW = Number(wRaw);
  if (!Number.isFinite(horizonW) || horizonW < 0)
    throw new RangeError(`W: "${wRaw}" is not a non-negative number (0 = ∞)`);
  return normalizeConfig({
    rMax,
    horizonW: Math.round(horizonW),
    intraRingOrder: $('cfg-order').value,
    ringMetric: $('cfg-metric').value,
    paranoid: $('cfg-paranoid').checked,
  });
}

/** Parse the top-K size list, reporting (not swallowing) junk entries. */
function readSizes() {
  const raw = String($('tk-sizes').value || '');
  const parts = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const sizes = [],
    bad = [];
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (Number.isInteger(n) && n > 0) sizes.push(n);
    else bad.push(p);
  }
  if (bad.length) log.warn(`ignoring invalid window size(s): ${bad.join(', ')}`);
  if (!sizes.length) throw new Error('no valid window sizes (expected e.g. "8,16,32,64")');
  return sizes;
}

$('btn-run').onclick = guard('run', () => {
  cfg = readConfig();
  opts.horizonW = cfg.horizonW;
  ringLog = [];
  opts.selection = null;
  $('export-status').textContent = '';
  runner.start(cfg);
  vp.fitRing(Math.max(1, cfg.rMax));
  renderer.invalidateOverlay();
  dirty = true;
  pushPermalink();
});
$('btn-stop').onclick = guard('stop', () => {
  runner.stop();
  $('engine-status').className = 'status';
  $('engine-status').textContent = `stopped at R=${store.rGen}`;
});
$('btn-reset').onclick = guard('reset', () => {
  runner.stop();
  store.reset();
  ringLog = [];
  opts.selection = null;
  renderer.invalidateOverlay();
  dirty = true;
  $('engine-status').className = 'status';
  $('engine-status').textContent = 'idle';
});

$('btn-verify').onclick = guard('verify', () => {
  const ps = store.snapshot();
  const el = $('engine-status');
  if (!ps.k) {
    el.className = 'status';
    el.textContent = 'nothing to verify';
    return;
  }
  const v = verify(ps.points, { horizonW: cfg.horizonW });
  const bf = verifyBruteForce(ps.points, { horizonW: cfg.horizonW });
  el.className = 'status ' + (v.ok && bf.ok ? 'ok' : 'err');
  el.textContent = v.ok
    ? `CERTIFIED  k=${v.k}  R=${v.rMax}  ${v.method}  ${v.ms.toFixed(0)} ms\n` +
      `brute-force: ${bf.skipped ? 'skipped (' + bf.reason + ')' : 'PASS'}\n` +
      `points sha256 ${pointsHash(ps.points).slice(0, 24)}…\n` +
      `config_hash  ${configHash(cfg).slice(0, 24)}…`
    : `FAILED (${v.method}) triple = ${JSON.stringify(v.triple || v)}`;
  if (!v.ok) log.error('verification FAILED', v);
});

$('btn-selftest').onclick = guard('self-test', () => {
  const el = $('engine-status');
  el.className = 'status';
  el.textContent = 'running self-test…';
  setTimeout(() => {
    try {
      const r = runSelfTest(() => {});
      el.className = 'status ' + (r.ok ? 'ok' : 'err');
      el.textContent = r.log;
    } catch (e) {
      fail('self-test', e);
    }
  }, 0);
});

// ---------------------------------------------------------------------- overlays
const bindCheck = (id, key) => {
  $(id).onchange = guard(`toggle ${key}`, (e) => {
    opts[key] = e.target.checked;
    renderer.invalidateOverlay();
    dirty = true;
    pushPermalink();
  });
};
bindCheck('ov-density', 'density');
bindCheck('ov-grid', 'grid');
bindCheck('ov-rings', 'rings');
bindCheck('ov-unknown', 'unknown');
bindCheck('ov-dead', 'dead');

$('ov-s').oninput = guard('window size', (e) => {
  const v = Number.parseInt(e.target.value, 10);
  if (!Number.isInteger(v) || v < 1) {
    log.warn(`ignoring window size "${e.target.value}"`);
    return;
  }
  opts.s = v;
  $('ov-s-out').textContent = opts.s;
  renderer.invalidateOverlay();
  dirty = true;
  drawLegend();
  pushPermalink();
});
$('ov-norm').onchange = guard('normalization', (e) => {
  if (e.target.value !== 's' && e.target.value !== '2s')
    throw new RangeError(`unknown normalization "${e.target.value}"`);
  opts.norm = e.target.value;
  renderer.invalidateOverlay();
  dirty = true;
  drawLegend();
});
$('ov-alpha').oninput = guard('opacity', (e) => {
  const v = Number(e.target.value);
  opts.alpha = Number.isFinite(v) ? Math.min(1, Math.max(0, v / 100)) : 0.7;
  dirty = true;
});

function drawLegend() {
  const max = opts.norm === '2s' ? 1 : 2;
  const conv =
    opts.s % 2
      ? 'max s×s window intersecting each point'
      : 'max s×s window intersecting each point (even s: centre biased LOW)';
  $('legend').innerHTML = `
        <div class="bar" style="background:${legendCss()}"></div>
        <div class="ticks"><span>0</span>
          <span>1.0 Erdős</span><span>1.5 HJSW</span><span>${max.toFixed(1)}</span></div>
        <div class="ticks"><span>${conv}</span></div>`;
}

// ------------------------------------------------------------------- top-K panel
const topk = new TopKPanel($('topk'), {
  onSelect(w) {
    opts.selection = w;
    vp.cx = w.x0 + w.s / 2;
    vp.cy = w.y0 + w.s / 2;
    vp.zoom = Math.max(1 / 64, Math.min(vp.w, vp.h) / (w.s * 1.6));
    renderer.invalidateOverlay();
    dirty = true;
    pushPermalink();
  },
});
$('btn-topk').onclick = () => {
  const ps = store.snapshot();
  ps.config = cfg;
  if (!ps.k) return;
  const sizes = $('tk-sizes')
    .value.split(',')
    .map((s) => parseInt(s, 10))
    .filter((s) => s > 0);
  topk.scan(ps, sizes, +$('tk-keep').value);
};

// ---------------------------------------------------------------------- exports
document.querySelectorAll('[data-export]').forEach((btn) => {
  btn.onclick = async () => {
    const ps = store.snapshot();
    const st = $('export-status');
    if (!ps.k) {
      st.textContent = 'nothing to export';
      return;
    }
    const kind = btn.dataset.export;
    const tag = `no3sieve_R${ps.rGen}_${configHash(cfg).slice(0, 8)}`;
    const rep = verify(ps.points, { horizonW: cfg.horizonW });
    if (!rep.ok) {
      st.className = 'status err';
      st.textContent = 'refusing to export: set failed verification';
      return;
    }
    const sizes = $('tk-sizes').value.split(',').map(Number).filter(Boolean);
    switch (kind) {
      case 'csv':
        EX.download(`${tag}.csv`, 'text/csv', EX.toCSV(ps.points));
        break;
      case 'json':
        EX.download(`${tag}.json`, 'application/json', EX.toJSON(ps.points, cfg));
        break;
      case 'ndjson':
        EX.download(`${tag}.ndjson`, 'application/x-ndjson', EX.toNDJSON(ringLog));
        break;
      case 'txt':
        EX.download(
          `${tag}.txt`,
          'text/plain',
          EX.toTXTGrid(ps.points, -ps.rGen, -ps.rGen, 2 * ps.rGen + 1)
        );
        break;
      case 'png':
        EX.download(`${tag}.png`, 'image/png', await EX.toPNGBlob(ps.points, ps.rGen));
        break;
      case 'svg':
        EX.download(`${tag}.svg`, 'image/svg+xml', EX.toSVG(ps.points, ps.rGen));
        break;
      case 'curve':
        EX.download(
          `${tag}_curve.csv`,
          'text/csv',
          EX.toDensityCurveCSV(ps.points, ps.rGen, sizes)
        );
        break;
      case 'manifest':
        EX.download(
          `${tag}_manifest.json`,
          'application/json',
          EX.toManifest(
            cfg,
            {
              k: ps.k,
              r_gen: ps.rGen,
              marks: runner.stats.marks,
              peak_events: runner.stats.peakEvents,
              ms: runner.stats.ms,
              points_sha256: pointsHash(ps.points),
              verification: rep,
            },
            null
          )
        );
        break;
    }
    st.className = 'status ok';
    st.textContent = `exported ${kind} · verified PASS (k=${rep.k})`;
  };
});

// -------------------------------------------------------------------- permalink
function pushPermalink() {
  const p = new URLSearchParams({
    cx: vp.cx.toFixed(2),
    cy: vp.cy.toFixed(2),
    zoom: vp.zoom.toFixed(4),
    s: opts.s,
    rmax: cfg.rMax,
    w: cfg.horizonW,
    order: cfg.intraRingOrder,
    ov: [
      opts.density && 'd',
      opts.grid && 'g',
      opts.rings && 'r',
      opts.unknown && 'u',
      opts.dead && 'x',
    ]
      .filter(Boolean)
      .join(''),
  });
  history.replaceState(null, '', '#' + p.toString());
}

function readPermalink() {
  let p;
  try {
    p = new URLSearchParams(location.hash.slice(1));
  } catch (e) {
    log.warn('unparseable permalink; using defaults', e);
    return;
  }
  if (!p.has('zoom')) return;
  // Every field is attacker/typo controlled: validate, clamp, and say what was dropped.
  const num = (key, def, lo, hi) => {
    if (!p.has(key)) return def;
    const v = Number(p.get(key));
    if (!Number.isFinite(v)) {
      log.warn(`permalink: ${key}="${p.get(key)}" is not a number; using ${def}`);
      return def;
    }
    return Math.min(hi, Math.max(lo, v));
  };
  vp.cx = num('cx', 0, -1e12, 1e12);
  vp.cy = num('cy', 0, -1e12, 1e12);
  vp.zoom = num('zoom', 12, 1 / 64, 64);
  opts.s = Math.round(num('s', 16, 3, 129));
  const ov = p.get('ov') || 'dgrux';
  opts.density = ov.includes('d');
  opts.grid = ov.includes('g');
  opts.rings = ov.includes('r');
  opts.unknown = ov.includes('u');
  opts.dead = ov.includes('x');
  $('cfg-rmax').value = Math.round(num('rmax', 256, 0, 8192));
  const w = Math.round(num('w', 0, 0, 16384));
  $('cfg-w').value = w;
  opts.horizonW = w;
  const order = p.get('order');
  if (order) {
    if (order === 'clockwise' || order === 'nearest_first') $('cfg-order').value = order;
    else
      log.warn(`permalink: unknown intra_ring_order "${order}"; keeping ${$('cfg-order').value}`);
  }
  $('ov-s').value = opts.s;
  $('ov-s-out').textContent = opts.s;
  $('ov-density').checked = opts.density;
  $('ov-grid').checked = opts.grid;
  $('ov-rings').checked = opts.rings;
  $('ov-unknown').checked = opts.unknown;
  $('ov-dead').checked = opts.dead;
}

// -------------------------------------------------------------------- bootstrap
try {
  readPermalink();
  drawLegend();
  resize();
  vp.fitRing(64);
  requestAnimationFrame(frame);
  $('engine-status').textContent = 'idle — press Run';
  $('topk').textContent = 'no scan yet';
  log.info('no3sieve ready', { version: cfg.version, rMax: cfg.rMax });
} catch (e) {
  fail('bootstrap', e);
  throw e; // a broken bootstrap must not look like a working, empty app
}