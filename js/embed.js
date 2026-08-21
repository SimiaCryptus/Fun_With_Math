/**
 * embed.js — page-embeddable PID-CA widget (§7.8).
 *
 * A self-contained ES module that can be dropped onto *any* page:
 *
 *   <div data-pidca data-pidca-controls="minimal">
 *     <script type="application/json" data-pidca-config>{"kp":1.4}</script>
 *   </div>
 *   <script type="module" src=".../pid-ca/js/embed.js"></script>
 *
 * It reuses the exact same Config / Simulation / Renderer trio as the full
 * app — only the heavyweight control panel is left out — so an embedded
 * widget is bit-identical to the configuration it was generated from.
 *
 * Programmatic use:
 *
 *   import { mount } from '.../pid-ca/js/embed.js';
 *   const w = mount('#demo', { config: { kp: 1.2 }, autoplay: true });
 *   w.setConfig({ target: 5 });   w.pause();   w.destroy();
 */

import { Config, diffFromDefaults } from './config.js';
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { PRESETS } from './presets.js';

export const EMBED_VERSION = '1.2.0';

const STYLE_ID = 'pidca-embed-style';

const CSS = `
.pidca-widget{--pidca-bg:#0b0f14;--pidca-fg:#d8e2ef;--pidca-dim:#8b9ab0;
  --pidca-line:#24303f;--pidca-accent:#4ec9b0;
  display:block;box-sizing:border-box;max-width:100%;
  background:var(--pidca-bg);color:var(--pidca-fg);
  border:1px solid var(--pidca-line);border-radius:8px;padding:8px;
  font:13px/1.4 ui-sans-serif,system-ui,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.pidca-widget *{box-sizing:border-box}
.pidca-canvas-wrap{background:#05080c;border:1px solid var(--pidca-line);
  border-radius:6px;overflow:hidden;display:flex;justify-content:center}
.pidca-widget canvas{display:block;max-width:100%;height:auto;
  image-rendering:pixelated;touch-action:none}
.pidca-widget canvas.pidca-interactive{cursor:crosshair}
.pidca-controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.pidca-btn{background:#182130;color:var(--pidca-fg);border:1px solid var(--pidca-line);
  border-radius:5px;padding:4px 10px;font:inherit;cursor:pointer}
.pidca-btn:hover{border-color:var(--pidca-accent)}
.pidca-btn.pidca-primary{background:var(--pidca-accent);color:#05231d;
  border-color:var(--pidca-accent);font-weight:600}
.pidca-speed{flex:0 1 110px;min-width:70px;accent-color:var(--pidca-accent)}
.pidca-label{color:var(--pidca-dim);font-size:11px;margin-left:auto;text-align:right}
.pidca-status{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;
  color:var(--pidca-dim);font-size:11px;font-variant-numeric:tabular-nums}
`;

function injectStyles(doc) {
  const d = doc || document;
  if (d.getElementById(STYLE_ID)) return;
  const style = d.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (d.head || d.documentElement).appendChild(style);
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return fallback;
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve a preset by (case-insensitive, partial) name. */
export function presetConfig(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  const hit =
    PRESETS.find((p) => p.name.toLowerCase() === key) ||
    PRESETS.find((p) => p.name.toLowerCase().includes(key));
  return hit ? { ...hit.config } : null;
}

export const DEFAULT_OPTIONS = {
  config: {},
  preset: null,
  controls: 'minimal', // 'none' | 'minimal' | 'full'
  autoplay: true,
  lazy: true, // only start once scrolled into view
  pauseWhenHidden: true,
  interactive: false,
  status: false,
  label: '',
  maxSteps: 0, // 0 = run forever
  cellSize: null, // override config.cellSize
};

function normalizeOptions(raw) {
  const o = raw || {};
  const controls = ['none', 'minimal', 'full'].includes(o.controls)
    ? o.controls
    : DEFAULT_OPTIONS.controls;
  let config = o.config;
  if (typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch (err) {
      console.warn('pid-ca embed: could not parse config string', err);
      config = {};
    }
  }
  return {
    config: config && typeof config === 'object' ? config : {},
    preset: o.preset || null,
    controls,
    autoplay: toBool(o.autoplay, DEFAULT_OPTIONS.autoplay),
    lazy: toBool(o.lazy, DEFAULT_OPTIONS.lazy),
    pauseWhenHidden: toBool(o.pauseWhenHidden, DEFAULT_OPTIONS.pauseWhenHidden),
    interactive: toBool(o.interactive, DEFAULT_OPTIONS.interactive),
    status: toBool(o.status, DEFAULT_OPTIONS.status),
    label: o.label ? String(o.label) : '',
    maxSteps: Math.max(0, Math.round(toNumber(o.maxSteps, 0))),
    cellSize: o.cellSize ? Math.max(1, Math.round(toNumber(o.cellSize, 0))) || null : null,
  };
}

/** Read widget options from `data-pidca-*` attributes + inline JSON config. */
export function optionsFromElement(host) {
  const d = host.dataset || {};
  const options = {};
  const json = host.querySelector('script[type="application/json"]');
  if (json) {
    try {
      options.config = JSON.parse(json.textContent);
    } catch (err) {
      console.warn('pid-ca embed: invalid inline JSON config', err);
    }
  }
  if (d.pidcaConfig) {
    try {
      options.config = { ...(options.config || {}), ...JSON.parse(d.pidcaConfig) };
    } catch (err) {
      console.warn('pid-ca embed: invalid data-pidca-config', err);
    }
  }
  if (d.pidcaPreset) options.preset = d.pidcaPreset;
  if (d.pidcaControls) options.controls = d.pidcaControls;
  if (d.pidcaAutoplay !== undefined) options.autoplay = d.pidcaAutoplay;
  if (d.pidcaLazy !== undefined) options.lazy = d.pidcaLazy;
  if (d.pidcaPauseHidden !== undefined) options.pauseWhenHidden = d.pidcaPauseHidden;
  if (d.pidcaInteractive !== undefined) options.interactive = d.pidcaInteractive;
  if (d.pidcaStatus !== undefined) options.status = d.pidcaStatus;
  if (d.pidcaLabel) options.label = d.pidcaLabel;
  if (d.pidcaMaxSteps) options.maxSteps = d.pidcaMaxSteps;
  if (d.pidcaCellSize) options.cellSize = d.pidcaCellSize;
  return options;
}

export class PIDCAWidget {
  constructor(target, options = {}) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('pid-ca embed: mount target not found');
    this.host = host;
    injectStyles(host.ownerDocument);

    const opts = (this.options = normalizeOptions(options));

    // ---- configuration -------------------------------------------------
    const initial = { ...(presetConfig(opts.preset) || {}), ...opts.config };
    if (opts.cellSize) initial.cellSize = opts.cellSize;
    this.config = new Config(initial);
    this.simulation = new Simulation(this.config);

    // ---- DOM -----------------------------------------------------------
    host.textContent = '';
    host.classList.add('pidca-widget');
    host.dataset.pidcaMounted = '1';

    if (opts.controls !== 'none') host.appendChild(this._buildControls(opts.controls));

    const wrap = document.createElement('div');
    wrap.className = 'pidca-canvas-wrap';
    this._wrap = wrap;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 200;
    if (opts.interactive) this.canvas.classList.add('pidca-interactive');
    wrap.appendChild(this.canvas);
    host.appendChild(wrap);

    if (opts.status) {
      this.statusNode = document.createElement('div');
      this.statusNode.className = 'pidca-status';
      host.appendChild(this.statusNode);
    }

    this.renderer = new Renderer(this.canvas, this.config);

    // ---- wiring --------------------------------------------------------
    this._listeners = Object.create(null);
    this._destroyed = false;
    this._raf = null;
    this._started = false;
    this._resumeOnVisible = false;

    const dirty = () => this._markDirty();
    this._off = [
      this.simulation.on('step', dirty),
      this.simulation.on('reset', dirty),
      this.simulation.on('paint', dirty),
      this.simulation.on('change', dirty),
      this.simulation.on('running', (running) => {
        this._updatePlayButton();
        this._emit(running ? 'play' : 'pause');
      }),
      this.config.subscribe(dirty),
    ];
    if (opts.maxSteps > 0) {
      this._off.push(
        this.simulation.on('step', () => {
          if (this.simulation.time >= opts.maxSteps) this.pause();
        })
      );
    }

    if (opts.interactive) this._bindPainting();
    this._markDirty();
    this._updatePlayButton();
    this._observeVisibility();

    if (!opts.lazy && opts.autoplay) {
      this._started = true;
      this.play();
    }
  }

  // ------------------------------------------------------------------ DOM
  _buildControls(kind) {
    const bar = document.createElement('div');
    bar.className = 'pidca-controls';
    const mk = (text, fn, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pidca-btn' + (cls ? ' ' + cls : '');
      b.textContent = text;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };

    this._playBtn = mk('Play', () => this.toggle(), 'pidca-primary');
    mk('Step', () => this.step());

    if (kind === 'full') {
      mk('Reset', () => this.reset());
      mk('Clear', () => this.simulation.clear());
      const speed = document.createElement('input');
      speed.type = 'range';
      speed.className = 'pidca-speed';
      speed.min = '0.5';
      speed.max = '120';
      speed.step = '0.5';
      speed.value = String(this.config.get('stepsPerSecond'));
      speed.title = 'Steps per second';
      speed.addEventListener('input', () => this.config.set('stepsPerSecond', Number(speed.value)));
      bar.appendChild(speed);
    }

    if (this.options.label) {
      const label = document.createElement('span');
      label.className = 'pidca-label';
      label.textContent = this.options.label;
      bar.appendChild(label);
    }
    return bar;
  }

  _updatePlayButton() {
    if (this._playBtn) this._playBtn.textContent = this.simulation.running ? 'Pause' : 'Play';
  }

  // -------------------------------------------------------------- drawing
  _markDirty() {
    if (this._destroyed || this._raf !== null) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._draw();
    });
  }

  _draw() {
    if (this._destroyed) return;
    this._syncChrome();
    this.renderer.draw(this.simulation);
    this._updateStatus();
  }
  /** Keep the widget frame in step with the configured canvas background. */
  _syncChrome() {
    const bg = this.config.get('colorBackground');
    if (this._wrap && this._chromeBg !== bg) {
      this._chromeBg = bg;
      this._wrap.style.background = bg;
    }
  }

  _updateStatus() {
    if (!this.statusNode) return;
    const s = this.simulation.stats;
    const membrane = this.config.get('mode') !== 'pid';
    const parts = membrane
      ? [
          ['step', String(s.step)],
          ['firing', ((s.firingFraction || 0) * 100).toFixed(2) + '%'],
          ['mean V', (s.meanV || 0).toFixed(2)],
        ]
      : [
          ['step', String(s.step)],
          ['active', (s.activeFraction * 100).toFixed(1) + '%'],
          ['mean |e|', s.meanAbsError.toFixed(3)],
        ];
    this.statusNode.textContent = parts.map(([k, v]) => k + ' ' + v).join('   ·   ');
  }

  // ----------------------------------------------------------- visibility
  _observeVisibility() {
    if (typeof IntersectionObserver !== 'function') {
      if (this.options.autoplay && !this._started) {
        this._started = true;
        this.play();
      }
      return;
    }
    this._io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) this._onVisibility(entry.isIntersecting);
      },
      { rootMargin: '120px' }
    );
    this._io.observe(this.host);
  }

  _onVisibility(visible) {
    if (this._destroyed) return;
    if (!visible) {
      if (this.options.pauseWhenHidden && this.simulation.running) {
        this._resumeOnVisible = true;
        this.simulation.pause();
      }
      return;
    }
    this._markDirty();
    if (this._resumeOnVisible) {
      this._resumeOnVisible = false;
      this.play();
    } else if (this.options.autoplay && !this._started) {
      this._started = true;
      this.play();
    }
  }

  // -------------------------------------------------------------- painting
  _bindPainting() {
    let painting = false;
    const canvas = this.canvas;
    const cellOf = (event) => this.renderer.cellFromEvent(event, this.simulation.grid);

    const apply = (cell, erase) => {
      const cfg = this.config.all();
      if (cfg.mode === 'pid') {
        this.simulation.paintCell(cell.x, cell.y, erase ? 0 : cfg.stateMax);
      } else {
        this.simulation.paintStimulus(cell.x, cell.y, erase ? 0 : cfg.stimulusAmplitude);
      }
    };

    canvas.addEventListener('pointerdown', (event) => {
      const cell = cellOf(event);
      if (!cell) return;
      painting = true;
      this._erase = event.button === 2 || event.shiftKey;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      apply(cell, this._erase);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!painting) return;
      const cell = cellOf(event);
      if (cell) apply(cell, this._erase);
    });
    const stop = () => {
      painting = false;
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  // ------------------------------------------------------------ public API
  play() {
    this._started = true;
    this.simulation.play();
    return this;
  }

  pause() {
    this.simulation.pause();
    this._resumeOnVisible = false;
    return this;
  }

  toggle() {
    if (this.simulation.running) this.pause();
    else this.play();
    return this;
  }

  /** Advance `n` steps with playback paused. */
  step(n = 1) {
    this.pause();
    for (let k = 0; k < Math.max(1, n | 0); k++) this.simulation.step();
    return this;
  }

  reset() {
    this.simulation.reset();
    return this;
  }

  clear() {
    this.simulation.clear();
    return this;
  }

  /** Patch the live configuration (same keys as the main app's JSON export). */
  setConfig(patch, { reset = false } = {}) {
    const errors = this.config.patch(patch || {});
    if (reset) this.simulation.reset();
    this._markDirty();
    return errors;
  }

  getConfig() {
    return this.config.toJSON();
  }

  /** Minimal config (only non-default keys) — what the snippet embeds. */
  snapshot() {
    return diffFromDefaults(this.config.toJSON());
  }

  getStats() {
    return { ...this.simulation.stats, running: this.simulation.running };
  }

  on(event, fn) {
    const set = this._listeners[event] || (this._listeners[event] = new Set());
    set.add(fn);
    return () => set.delete(fn);
  }

  _emit(event, payload) {
    const set = this._listeners[event];
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload, this);
      } catch (err) {
        console.error('pid-ca embed listener failed', err);
      }
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._io) this._io.disconnect();
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    for (const off of this._off || []) {
      try {
        off();
      } catch (err) {
        /* ignore */
      }
    }
    this.simulation.dispose();
    this.host.textContent = '';
    this.host.classList.remove('pidca-widget');
    delete this.host.dataset.pidcaMounted;
    this._emit('destroy');
    this._listeners = Object.create(null);
  }
}

/** Mount one widget; element `data-pidca-*` attributes are merged under `options`. */
export function mount(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('pid-ca embed: mount target not found');
  const fromEl = optionsFromElement(host);
  const merged = {
    ...fromEl,
    ...options,
    config: { ...(fromEl.config || {}), ...(options.config || {}) },
  };
  const widget = new PIDCAWidget(host, merged);
  host.__pidcaWidget = widget;
  return widget;
}

/** Mount every not-yet-mounted `[data-pidca]` element inside `root`. */
export function mountAll(root = document) {
  const nodes = root.querySelectorAll('[data-pidca]:not([data-pidca-mounted])');
  const widgets = [];
  nodes.forEach((node) => {
    try {
      widgets.push(mount(node));
    } catch (err) {
      console.error('pid-ca embed: mount failed', err);
    }
  });
  return widgets;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAll());
  } else {
    mountAll();
  }
  window.PIDCAEmbed = {
    version: EMBED_VERSION,
    Widget: PIDCAWidget,
    mount,
    mountAll,
    presetConfig,
    presets: PRESETS.map((p) => p.name),
  };
}

export default PIDCAWidget;
