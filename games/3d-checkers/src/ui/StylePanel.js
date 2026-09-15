import { THEMES, STYLE_FIELDS, DEFAULT_THEME, resolveStyle, nextTheme } from '../core/themes.js';
import { toast } from './Toast.js';

const fmt = (v) => (typeof v === 'number' ? v.toFixed(2).replace(/\.?0+$/, '') : '');

/**
 * "Appearance" dialog: pick a preset theme, then fine-tune individual style
 * settings (colours, transparency, lighting). Tweaks are stored in the settings
 * store as `style` overrides on top of the chosen `theme`, so "Reset to theme"
 * can always return to the preset. Every change is applied live.
 */
export function initStylePanel({ store, onApply }) {
  const el = document.getElementById('style');
  const form = document.getElementById('style-form');
  const groupsEl = document.getElementById('style-groups');
  const resetBtn = document.getElementById('style-reset');
  const closeBtn = document.getElementById('style-close');
  const themeSel = form.elements.theme;
  for (const [key, t] of Object.entries(THEMES)) themeSel.add(new Option(t.label, key));

  const themeName = () => (THEMES[store.get('theme')] ? store.get('theme') : DEFAULT_THEME);
  const overrides = () => ({ ...(store.get('style') || {}) });
  const current = () => resolveStyle(themeName(), store.get('style'));
  const apply = () => onApply(current());

  // Build one control per STYLE_FIELDS entry, grouped into fieldsets.
  const inputs = new Map();
  const groups = new Map();
  for (const f of STYLE_FIELDS) {
    let fs = groups.get(f.group);
    if (!fs) {
      fs = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = f.group;
      fs.appendChild(legend);
      groups.set(f.group, fs);
      groupsEl.appendChild(fs);
    }
    const row = document.createElement('label');
    row.className = 'row';
    const text = document.createElement('span');
    text.textContent = f.label;
    const input = document.createElement('input');
    input.name = f.key;
    if (f.type === 'color') input.type = 'color';
    else if (f.type === 'check') input.type = 'checkbox';
    else Object.assign(input, { type: 'range', min: f.min, max: f.max, step: f.step });
    const out = f.type === 'range' ? document.createElement('output') : null;
    row.append(text, input);
    if (out) row.appendChild(out);
    fs.appendChild(row);
    inputs.set(f.key, { input, out, field: f });
    input.addEventListener('input', () => {
      const v = f.type === 'check' ? input.checked : f.type === 'color' ? input.value : +input.value;
      if (out) out.value = fmt(v);
      const o = overrides();
      o[f.key] = v;
      store.set('style', o);
      resetBtn.disabled = false;
      apply();
    });
  }

  function fill() {
    const s = current();
    themeSel.value = themeName();
    for (const { input, out, field } of inputs.values()) {
      if (field.type === 'check') input.checked = !!s[field.key];
      else input.value = s[field.key];
      if (out) out.value = fmt(s[field.key]);
    }
    resetBtn.disabled = Object.keys(store.get('style') || {}).length === 0;
  }

  function setTheme(name, announce = false) {
    if (!THEMES[name]) name = DEFAULT_THEME;
    store.set('theme', name);
    store.set('style', {}); // a fresh preset discards previous tweaks
    fill();
    apply();
    if (announce) toast(`Theme: ${THEMES[name].label}`);
  }

  themeSel.addEventListener('change', () => setTheme(themeSel.value));
  resetBtn.addEventListener('click', () => setTheme(themeName()));
  closeBtn.addEventListener('click', () => api.hide());
  form.addEventListener('submit', (e) => { e.preventDefault(); api.hide(); });

  const api = {
    show() { fill(); el.classList.remove('hidden'); },
    hide() { el.classList.add('hidden'); },
    isOpen() { return !el.classList.contains('hidden'); },
    /** Step to the next preset in the library (keyboard `T`). */
    cycle() { setTheme(nextTheme(themeName()), true); },
    current,
    apply,
  };
  fill();
  return api;
}