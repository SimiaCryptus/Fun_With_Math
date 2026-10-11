/**
 * Theme switching (css/themes.css) and token → RGB conversion for the WebGL views.
 * 'system' removes data-theme so the OS preference decides; 'dark' / 'light' pin it.
 */
import {THEME_STORAGE_KEY as KEY} from '../../css/themes.js';

const mq = window.matchMedia('(prefers-color-scheme: light)');
const listeners = new Set();

export function storedTheme() {
    try {
        const t = localStorage.getItem(KEY);
        return t === 'dark' || t === 'light' ? t : 'system';
    } catch {
        return 'system';
    }
}

/** 'dark' or 'light' — what is actually shown. */
export function effectiveTheme() {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark' || t === 'light') return t;
    return mq.matches ? 'light' : 'dark';
}

export function setTheme(mode) {
    const root = document.documentElement;
    if (mode === 'dark' || mode === 'light') root.dataset.theme = mode;
    else delete root.dataset.theme;
    try {
        if (mode === 'dark' || mode === 'light') localStorage.setItem(KEY, mode);
        else localStorage.removeItem(KEY);
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

mq.addEventListener?.('change', () => {
    if (storedTheme() === 'system') notify();
});

let ctx = null;

/** sRGB triple in [0, 1] of a CSS custom property (any CSS colour syntax, including oklch). */
export function cssColor(name, fallback = [0, 0, 0]) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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