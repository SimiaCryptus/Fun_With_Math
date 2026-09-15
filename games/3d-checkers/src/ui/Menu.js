import { SETUPS, piecesPerSide, setupRanks } from '../engine/setups.js';
import { DIFFICULTY } from '../ai/difficulty.js';

export function initMenu({ store, onStart }) {
  const el = document.getElementById('menu');
  const form = document.getElementById('menu-form');
  const cancel = document.getElementById('menu-cancel');

  const fields = () => [...form.elements].filter((i) => i.name);
  // Fields are optional in the markup; fall back to stored settings/defaults.
  const field = (name) => form.elements[name] || null;
  const numField = (name, fallback) => +(field(name)?.value ?? store.get(name)) || fallback;
  const levelCount = () => numField('levels', 8);
  const boardSize = () => numField('size', 8);
  /** The row (label) wrapping a control — works for radio groups too. */
  const rowOf = (ctrl) => {
    const el = ctrl && (ctrl.closest ? ctrl : ctrl[0]);
    return el?.closest?.('label, .row') ?? null;
  };
  /** The markup may predate autoplay — add the 0-player mode option on demand. */
  const ensureAutoMode = () => {
    const mode = field('mode');
    if (!mode) return;
    if (mode.tagName === 'SELECT') {
      if (![...mode.options].some((o) => o.value === 'auto')) mode.add(new Option('CPU vs CPU (autoplay)', 'auto'));
      return;
    }
    const radios = [...form.querySelectorAll('input[name=mode]')];
    if (!radios.length || radios.some((r) => r.value === 'auto')) return;
    const template = radios[radios.length - 1].closest('label');
    const wrap = document.createElement('label');
    wrap.className = template?.className ?? '';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'mode';
    input.value = 'auto';
    wrap.append(input, document.createTextNode(' CPU vs CPU (autoplay)'));
    (template?.parentElement ?? form).insertBefore(wrap, template ? template.nextSibling : null);
    input.addEventListener('change', toggleCpu);
  };
  const diffOptions = () => {
    const sel = field('difficulty');
    if (sel?.options?.length) return [...sel.options].map((o) => [o.value, o.textContent]);
    return Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]);
  };
  /** Per-side engine strength pickers, used only by the 0-player mode. */
  const ensureAutoFields = () => {
    if (form.querySelector('.auto-only')) return;
    const anchor = rowOf(field('difficulty')) ?? rowOf(field('setup'));
    const opts = diffOptions();
    const host = anchor?.parentElement ?? form;
    let after = anchor;
    for (const [name, label] of [['redDifficulty', 'Red CPU'], ['blackDifficulty', 'Black CPU']]) {
      const row = document.createElement('label');
      row.className = 'row auto-only hidden';
      row.textContent = `${label} `;
      const sel = document.createElement('select');
      sel.name = name;
      for (const [value, text] of opts) sel.add(new Option(text, value));
      sel.value = store.get(name) ?? store.get('difficulty') ?? 'medium';
      row.appendChild(sel);
      host.insertBefore(row, after ? after.nextSibling : null);
      after = row;
    }
  };


  // Piece counts depend on the board size and number of levels, so label the setups on the fly.
  const updateSetupLabels = () => {
    const setup = field('setup');
    if (!setup?.options) return;
    const size = boardSize(), levels = levelCount();
    for (const opt of setup.options) {
      const s = SETUPS[opt.value];
      if (!s) continue;
      const ranks = setupRanks(opt.value, size);
      const n = piecesPerSide(opt.value, size, levels);
      opt.textContent = `${s.label} — ${n} v ${n} (${ranks} rank${ranks > 1 ? 's' : ''})`;
    }
  };
  const prefill = () => {
    ensureAutoMode();
    ensureAutoFields();
    for (const input of fields()) {
      const v = store.get(input.name);
      if (v === undefined) continue;
      if (input.type === 'checkbox') input.checked = !!v;
      else if (input.type === 'radio') input.checked = String(v) === input.value;
      else input.value = v;
    }
    toggleCpu();
    updateSetupLabels();
  };
  const toggleCpu = () => {
    const mode = field('mode')?.value ?? store.get('mode');
    const cpu = mode === 'cpu';
    const auto = mode === 'auto';
    // Engine settings are relevant to both CPU modes; the human side is not.
    form.querySelectorAll('.cpu-only').forEach((r) => r.classList.toggle('hidden', !cpu && !auto));
    form.querySelectorAll('.auto-only').forEach((r) => r.classList.toggle('hidden', !auto));
    rowOf(field('humanSide'))?.classList.toggle('hidden', auto);
    rowOf(field('difficulty'))?.classList.toggle('hidden', auto);
  };
  form.querySelectorAll('input[name=mode], select[name=mode]').forEach((r) => r.addEventListener('change', toggleCpu));
  for (const name of ['levels', 'size']) {
    field(name)?.addEventListener('change', updateSetupLabels);
    field(name)?.addEventListener('input', updateSetupLabels);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {};
    for (const input of fields()) {
      if (input.type === 'checkbox') data[input.name] = input.checked;
      else if (input.type === 'radio') { if (input.checked) data[input.name] = input.value; }
      else data[input.name] = input.type === 'number' ? +input.value : input.value;
    }
    for (const k of Object.keys(data)) store.set(k, data[k]);
    api.hide();
    onStart({
      mode: data.mode ?? store.get('mode') ?? 'cpu',
      humanSide: +(data.humanSide ?? store.get('humanSide') ?? 0),
      difficulty: data.difficulty ?? store.get('difficulty') ?? 'medium',
      redDifficulty: data.redDifficulty ?? store.get('redDifficulty') ?? data.difficulty ?? 'medium',
      blackDifficulty: data.blackDifficulty ?? store.get('blackDifficulty') ?? data.difficulty ?? 'medium',
      setup: data.setup ?? store.get('setup') ?? 'standard',
      size: +(data.size ?? store.get('size')) || 8,
      levels: +(data.levels ?? store.get('levels')) || 8,
      redName: data.redName || store.get('redName') || 'Red',
      blackName: data.blackName || store.get('blackName') || 'Black',
    });
  });

  const api = {
    show() { prefill(); el.classList.remove('hidden'); cancel.disabled = !api.canCancel; },
    hide() { el.classList.add('hidden'); },
    isOpen() { return !el.classList.contains('hidden'); },
    canCancel: false,
  };
  cancel.addEventListener('click', () => api.hide());
  prefill();
  return api;
}