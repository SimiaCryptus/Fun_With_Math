/* ============================================================
   js/themes.js — colour-theme registry, persistence and picker.

   themes.css supplies the palettes; this module only decides
   which `data-theme` sits on <html>, remembers the choice, and
   renders the menu. The inline boot script in index.html applies
   the stored value before first paint, so this file never causes
   a flash of the wrong theme.

   Public API: window.CognotikTheme
     .list()            → [{ id, label, scheme }, …]
     .get()             → stored choice ('auto' | theme id)
     .resolved()        → the theme id actually in effect
     .set(id)           → apply + persist ('auto' accepted)
   Emits a `themechange` CustomEvent on `document` after every
   change: { detail: { choice, theme } }.
   ============================================================ */

(() => {
  'use strict';

  const STORAGE_KEY = 'cognotik:theme';

  /** Which concrete theme "auto" maps to for each system preference. */
  const AUTO = { dark: 'mainMenu', light: 'newGame' };

  /** Must stay in sync with the blocks declared in css/themes.css. */
  const THEMES = [
    { id: 'mainMenu', label: 'Main Menu', scheme: 'dark' },
    { id: 'newGame', label: 'New Game', scheme: 'light' },
    { id: 'saveRoom', label: 'Save Room', scheme: 'dark' },
    { id: 'voidRunner', label: 'Void Runner', scheme: 'dark' },
    { id: 'hardcoreMode', label: 'Hardcore Mode', scheme: 'dark' },
    { id: 'questLog', label: 'Quest Log', scheme: 'light' },
    { id: 'finalBoss', label: 'Final Boss', scheme: 'dark' },
    { id: 'hydroZone', label: 'Hydro Zone', scheme: 'dark' },
    { id: 'synthwave', label: 'Synthwave', scheme: 'dark' },
    { id: 'jungleBiome', label: 'Jungle Biome', scheme: 'dark' },
    { id: 'rainbowRoad', label: 'Rainbow Road', scheme: 'light' },
    { id: 'lavaLevel', label: 'Lava Level', scheme: 'dark' },
    { id: 'powerUp', label: 'Power Up', scheme: 'light' },
  ];

  const BY_ID = new Map(THEMES.map((t) => [t.id, t]));
  const root = document.documentElement;
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const prefersDark = () => (darkQuery ? darkQuery.matches : true);

  const resolve = (choice) =>
    choice === 'auto'
      ? prefersDark()
        ? AUTO.dark
        : AUTO.light
      : BY_ID.has(choice)
        ? choice
        : AUTO.dark;

  function readChoice() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'auto' || BY_ID.has(v) ? v : 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  function writeChoice(choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch (_) {
      /* private mode / storage disabled — session-only theming */
    }
  }

  let choice = readChoice();

  /* ---------------------------------------------------------- *
   * Apply
   * ---------------------------------------------------------- */

  /** Keep the browser UI (address bar, task switcher) in step. */
  function syncMetaThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;left:-9999px;width:0;height:0;background-color:var(--color-canvas)';
    root.appendChild(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    if (colour) meta.setAttribute('content', colour);
  }

  function apply(next, persist) {
    choice = next === 'auto' || BY_ID.has(next) ? next : 'auto';
    const theme = resolve(choice);
    root.setAttribute('data-theme', theme);
    root.dataset.themeChoice = choice;
    if (persist) writeChoice(choice);
    syncMetaThemeColor();
    markChecked();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { choice, theme } }));
  }

  /* ---------------------------------------------------------- *
   * Picker UI
   * ---------------------------------------------------------- */

  const toggle = document.getElementById('themeToggle');
  const menu = document.getElementById('themeMenu');

  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  const swatches = () =>
    '<span class="theme-swatches" aria-hidden="true">' +
    [1, 2, 3, 4, 5].map((n) => `<span class="theme-dot theme-dot-${n}"></span>`).join('') +
    '</span>';

  function optionMarkup(t) {
    // No data-theme on "auto": it inherits :root and so previews
    // whatever is currently in effect.
    const preview = t.id === 'auto' ? '' : ` data-theme="${esc(t.id)}"`;
    const note =
      t.id === 'auto'
        ? '<span class="theme-option-note">follows your device</span>'
        : `<span class="theme-option-note">${t.scheme}</span>`;
    return `
      <button type="button" class="theme-option${t.id === 'auto' ? ' is-auto' : ''}"
              role="menuitemradio" aria-checked="false"
              data-choice="${esc(t.id)}"${preview}>
        <span class="theme-option-name">${esc(t.label)}</span>
        ${t.id === 'auto' ? note : swatches()}
      </button>`;
  }

  function buildMenu() {
    if (!menu) return;
    menu.innerHTML =
      '<p class="theme-menu-title">Colour theme</p>' +
      optionMarkup({ id: 'auto', label: 'Auto', scheme: 'auto' }) +
      THEMES.map(optionMarkup).join('') +
      '<p class="theme-menu-hint">Your choice is remembered in this browser. ' +
      'Press <kbd>t</kbd> to reopen this menu.</p>';
  }

  function markChecked() {
    if (!menu) return;
    for (const btn of menu.querySelectorAll('.theme-option')) {
      btn.setAttribute('aria-checked', String(btn.dataset.choice === choice));
    }
    if (toggle) {
      const label = choice === 'auto' ? 'Auto' : BY_ID.get(choice).label;
      toggle.setAttribute('title', `Colour theme — ${label}`);
      toggle.setAttribute('aria-label', `Colour theme (currently ${label})`);
    }
  }

  const isOpen = () => menu && !menu.hidden;

  function openMenu() {
    if (!menu || !toggle) return;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    const checked = menu.querySelector('.theme-option[aria-checked="true"]');
    (checked || menu.querySelector('.theme-option'))?.focus();
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }

  function closeMenu(refocus) {
    if (!menu || !toggle) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    if (refocus) toggle.focus();
  }

  function onDocClick(ev) {
    if (!menu.contains(ev.target) && !toggle.contains(ev.target)) closeMenu(false);
  }

  function bind() {
    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => (isOpen() ? closeMenu(false) : openMenu()));

    menu.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.theme-option');
      if (!btn) return;
      apply(btn.dataset.choice, true);
      closeMenu(true);
    });

    // Roving keyboard support inside the popover.
    menu.addEventListener('keydown', (ev) => {
      const items = Array.from(menu.querySelectorAll('.theme-option'));
      const i = items.indexOf(document.activeElement);
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeMenu(true);
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        items[(i + 1 + items.length) % items.length]?.focus();
      } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        items[(i - 1 + items.length) % items.length]?.focus();
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        items[0]?.focus();
      } else if (ev.key === 'End') {
        ev.preventDefault();
        items[items.length - 1]?.focus();
      }
    });

    // `t` opens the picker, mirroring `/` for search.
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 't' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (document.body.classList.contains('modal-open')) return;
      ev.preventDefault();
      isOpen() ? closeMenu(true) : openMenu();
    });
  }

  /* ---------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------- */

  buildMenu();
  bind();
  apply(choice, false);

  // Re-resolve "auto" when the system preference flips.
  if (darkQuery) {
    const onScheme = () => {
      if (choice === 'auto') apply('auto', false);
    };
    if (darkQuery.addEventListener) darkQuery.addEventListener('change', onScheme);
    else if (darkQuery.addListener) darkQuery.addListener(onScheme);
  }

  // Keep other tabs of the arcade in sync.
  window.addEventListener('storage', (ev) => {
    if (ev.key === STORAGE_KEY && ev.newValue) apply(ev.newValue, false);
  });

  window.CognotikTheme = {
    list: () => THEMES.slice(),
    get: () => choice,
    resolved: () => resolve(choice),
    set: (id) => apply(id, true),
  };
})();
