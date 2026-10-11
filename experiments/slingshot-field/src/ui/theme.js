/**
 * Theme switching, integrated with the generated themes (css/themes.css) via the manifest css/themes.js.
 *
 * - data-theme on <html> selects a generated `[data-theme="<id>"]` block. 'system' removes it, so the
 *   generated :root / prefers-color-scheme blocks decide.
 * - data-scheme ('dark' | 'light') is always set; css/app-tokens.css and color-scheme key off it.
 * - cssColor converts a token to sRGB for the WebGL views.
 */
import {THEME_STORAGE_KEY as KEY, THEMES} from '../../css/themes.js';

const SCHEME_KEY = `${KEY}.scheme`;
const root = document.documentElement;
const mq = window.matchMedia('(prefers-color-scheme: light)');
const listeners = new Set();
const byId = new Map(THEMES.map((t) => [t.id, t]));

/** The theme manifest (id, name, scheme). */
export const themeList = () => THEMES;

/** Fill a <select> with the themes from the manifest and select the stored one. */
export function populateThemeSelect(sel) {
    sel.replaceChildren();
    for (const t of THEMES) {
        const o = new Option(t.name, t.id);
        o.title = t.scheme ? `${t.name} (${t.scheme})` : 'Follow the operating-system light/dark preference';
        sel.add(o);
    }
    sel.value = storedTheme();
}

const isTheme = (id) => !!byId.get(id)?.scheme;

export function storedTheme() {
    try {
        const t = localStorage.getItem(KEY);
        return isTheme(t) ? t : 'system';
    } catch {
        return 'system';
    }
}

/** 'dark' or 'light' — the native scheme of what is actually shown. */
export function effectiveScheme() {
    const t = byId.get(root.dataset.theme);
    if (t?.scheme) return t.scheme;
    return mq.matches ? 'light' : 'dark';
}

/** Id of the theme actually shown ('system' resolves to the generated 'dark' or 'light'). */
export function effectiveTheme() {
    return isTheme(root.dataset.theme) ? root.dataset.theme : effectiveScheme();
}

function applyScheme() {
    root.dataset.scheme = effectiveScheme();
}

export function setTheme(mode) {
    if (isTheme(mode)) root.dataset.theme = mode;
    else delete root.dataset.theme;
    applyScheme();
    try {
        if (isTheme(mode)) {
            localStorage.setItem(KEY, mode);
            localStorage.setItem(SCHEME_KEY, byId.get(mode).scheme);
        } else {
            localStorage.removeItem(KEY);
            localStorage.removeItem(SCHEME_KEY);
        }
    } catch { /* storage unavailable */ }
    notify();
}

export function onThemeChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function notify() {
    const t = effectiveTheme();
    for (const fn of listeners) fn(t);
}

// Sanitize whatever the boot script applied (e.g. a stale id from an older manifest).
if (root.dataset.theme && !isTheme(root.dataset.theme)) delete root.dataset.theme;
applyScheme();

mq.addEventListener?.('change', () => {
    if (storedTheme() === 'system') {
        applyScheme();
        notify();
    }
});

let ctx = null, probe = null;

/** Fully resolved colour of a custom property (var() and color-mix() substituted), or ''. */
function resolveToken(name) {
    const raw = getComputedStyle(root).getPropertyValue(name).trim();
    if (!raw) return '';
    if (!probe) {
        probe = document.createElement('span');
        probe.style.display = 'none';
        (document.body ?? root).appendChild(probe);
    }
    probe.style.color = '';
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color || raw;
}

/** sRGB triple in [0, 1] of a CSS custom property (any CSS colour syntax, including oklch / color-mix). */
export function cssColor(name, fallback = [0, 0, 0]) {
    const v = resolveToken(name);
    if (!v) return fallback;
    if (!ctx) {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        ctx = c.getContext('2d', {willReadFrequently: true});
    }
    if (!ctx) return fallback;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
}