/* ─────────────────────────────────────────────────────────────
   theme.js — persists the active Point-CAD theme (css/themes.css)
   and exposes it via [data-theme] on <html>.

   Loaded synchronously in <head> so the attribute is present
   before first paint (no flash of the wrong palette).
   ───────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const KEY = 'mathx-theme';
  const DEFAULT = 'dark';

  /** Themes whose canvas is bright — used to flip color-scheme + hairlines. */
  const LIGHT = new Set(['light', 'paper', 'tiedye', 'candy']);

  const VALID = new Set([
    'auto',
    'dark',
    'light',
    'dim',
    'midnight',
    'highContrast',
    'paper',
    'dusk',
    'ocean',
    'cyberpunk',
    'jungle',
    'tiedye',
    'sunset',
    'candy',
  ]);

  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      return VALID.has(v) ? v : DEFAULT;
    } catch (_) {
      return DEFAULT;
    }
  }

  function save(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch (_) {
      /* private mode — session-only theming */
    }
  }

  function isLight(theme) {
    if (theme === 'auto') return Boolean(mq && mq.matches);
    return LIGHT.has(theme);
  }

  function syncMetaColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const c = getComputedStyle(root).getPropertyValue('--color-canvas').trim();
    if (c) meta.setAttribute('content', c);
  }

  function apply(theme) {
    // 'auto' defers to the prefers-color-scheme block inside themes.css.
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    const light = isLight(theme);
    root.classList.toggle('theme-light', light);
    root.style.colorScheme = light ? 'light' : 'dark';

    // Defer: the new custom properties must be resolved first.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncMetaColor);
    else syncMetaColor();

    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme, light } }));
  }

  let current = read();
  apply(current);

  if (mq && typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', () => {
      if (current === 'auto') apply('auto');
    });
  }

  function wire() {
    const select = document.getElementById('themeSelect');
    if (!select) return;
    select.value = current;
    select.addEventListener('change', () => {
      current = VALID.has(select.value) ? select.value : DEFAULT;
      save(current);
      apply(current);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }

  // Small programmatic hook for other scripts / the console.
  window.setTheme = (t) => {
    if (!VALID.has(t)) return false;
    current = t;
    save(t);
    apply(t);
    const sel = document.getElementById('themeSelect');
    if (sel) sel.value = t;
    return true;
  };
})();
