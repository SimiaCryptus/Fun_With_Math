// Split chooser dialog. Given a target number value, it offers friendly
// presets, plus a custom "a op b" picker. In 'factor' mode it offers
// multiplicative factorizations instead of additive splits.
// Every option is validated to preserve value before being offered/used.

import { el, clear, on } from '../util/dom.js';

export class SplitChooser {
  constructor(root, { onChoose } = {}) {
    this.root = root;
    this.onChoose = onChoose;
    this._offDoc = null;
    this.hide();
  }

  // mode: 'split' (additive) or 'factor' (multiplicative)
  show(value, mode = 'split') {
    clear(this.root);
    const options = mode === 'factor' ? factorsFor(value) : presetsFor(value);

    const title = mode === 'factor' ? `Factorize ${value}` : `Break apart ${value}`;
    const panel = el('div', { class: 'chooser-panel' }, [
      el('div', { class: 'chooser-title' }, title),
    ]);

    const list = el('div', { class: 'chooser-options' });
    for (const opt of options) {
      list.appendChild(
        el(
          'button',
          {
            class: 'chooser-btn',
            type: 'button',
            onClick: () => {
              this.hide();
              this.onChoose && this.onChoose(opt.into);
            },
          },
          opt.label,
        ),
      );
    }
    panel.appendChild(list);

    // Custom picker: a op b with live validation.
    const custom = this._customPicker(value, mode);
    panel.appendChild(custom);

    panel.appendChild(
      el(
        'button',
        {
          class: 'chooser-cancel',
          type: 'button',
          onClick: () => this.hide(),
        },
        'Cancel',
      ),
    );

    this.root.appendChild(panel);
    this.root.classList.add('visible');

    if (this._offDoc) this._offDoc();
    this._offDoc = on(document, 'pointerdown', (e) => {
      if (!this.root.contains(e.target)) this.hide();
    });
  }

  _customPicker(value, mode = 'split') {
    const wrap = el('div', { class: 'chooser-custom' });
    const a = el('input', { type: 'number', class: 'chooser-input', value: String(value) });
    const addOps = [el('option', { value: '+' }, '+'), el('option', { value: '-' }, '−')];
    const mulOps = [el('option', { value: '*' }, '×'), el('option', { value: '/' }, '÷')];
    const opSel = el('select', { class: 'chooser-op' }, mode === 'factor' ? mulOps : addOps);
    const b = el('input', { type: 'number', class: 'chooser-input', value: '0' });
    const feedback = el('span', { class: 'chooser-feedback' }, '');
    const go = el('button', { class: 'chooser-btn', type: 'button' }, 'Use');

    const validate = () => {
      const av = Number(a.value);
      const bv = Number(b.value);
      const opv = opSel.value;
      let ok = false;
      if (Number.isFinite(av) && Number.isFinite(bv)) {
        if (opv === '/') {
          ok = bv !== 0 && av % bv === 0 && av / bv === value;
        } else if (opv === '*') {
          ok = av * bv === value;
        } else if (opv === '+') {
          ok = av + bv === value;
        } else if (opv === '-') {
          ok = av - bv === value;
        }
      }
      feedback.textContent = ok ? '✓ equals ' + value : '✗ not ' + value;
      feedback.className = 'chooser-feedback ' + (ok ? 'ok' : 'bad');
      go.disabled = !ok;
      return ok;
    };
    a.addEventListener('input', validate);
    b.addEventListener('input', validate);
    opSel.addEventListener('change', validate);
    go.addEventListener('click', () => {
      if (!validate()) return;
      this.hide();
      this.onChoose && this.onChoose(`${a.value} ${opSel.value} ${b.value}`);
    });
    validate();

    wrap.append(a, opSel, b, feedback, go);
    return wrap;
  }

  hide() {
    this.root.classList.remove('visible');
    clear(this.root);
    if (this._offDoc) {
      this._offDoc();
      this._offDoc = null;
    }
  }
}

// Generate a small set of value-preserving additive split presets.
function presetsFor(value) {
  const out = [];
  const seen = new Set();
  const add = (label, into) => {
    if (seen.has(into)) return;
    seen.add(into);
    out.push({ label, into });
  };

  // Nearest ten ± n.
  const lowerTen = Math.floor(value / 10) * 10;
  const upperTen = lowerTen + 10;
  if (lowerTen !== value && lowerTen > 0) {
    add(`${lowerTen} + ${value - lowerTen}`, `${lowerTen} + ${value - lowerTen}`);
  }
  if (upperTen !== value) {
    add(`${upperTen} − ${upperTen - value}`, `${upperTen} - ${upperTen - value}`);
  }

  // Make a five.
  const lowerFive = Math.floor(value / 5) * 5;
  if (lowerFive !== value && lowerFive > 0) {
    add(`${lowerFive} + ${value - lowerFive}`, `${lowerFive} + ${value - lowerFive}`);
  }

  // Halve (if even).
  if (value % 2 === 0 && value !== 0) {
    add(`${value / 2} + ${value / 2}`, `${value / 2} + ${value / 2}`);
  }

  return out;
}

// Generate multiplicative factorization presets: a × b for each
// non-trivial factor pair.
function factorsFor(value) {
  const out = [];
  const seen = new Set();
  const add = (label, into) => {
    if (seen.has(into)) return;
    seen.add(into);
    out.push({ label, into });
  };

  const av = Math.abs(value);
  if (av > 1) {
    for (let f = 2; f * f <= av; f++) {
      if (av % f === 0) {
        const other = value / f;
        add(`${f} × ${other}`, `${f} * ${other}`);
      }
    }
  }

  return out;
}
