/**
 * ui.js — control panel, playback controls, painting, presets (§7.7, §9).
 *
 * Controls are generated from the schema in config.js, so a new parameter
 * needs no UI code: declare it in SCHEMA and it appears here.
 */

import { SCHEMA, GROUPS, toHashString } from './config.js';
import { STATE_COLORS } from './renderer.js';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export class UI {
  constructor({
    config,
    simulation,
    renderer,
    canvas,
    panelRoot,
    toolbarRoot,
    statusRoot,
    legendRoot,
    presets = [],
  }) {
    this.config = config;
    this.sim = simulation;
    this.renderer = renderer;
    this.canvas = canvas;
    this.panel = panelRoot;
    this.toolbar = toolbarRoot;
    this.statusRoot = statusRoot;
    this.legendRoot = legendRoot;
    this.presets = presets;

    this.controls = new Map();
    this._statusFields = {};
    this._applying = false;

    this._buildToolbar();
    this._buildStatus();
    this._buildPanel();
    this._bindPainting();
    this._bindKeys();

    this.config.subscribe(() => this.syncFromConfig());
    this.sim.on('running', () => this._updatePlayButton());
    this.sim.on('reset', () => this.updateStatus());

    this.syncFromConfig();
    this._updatePlayButton();
    this.updateStatus();
  }

  // -------------------------------------------------------------- toolbar
  _buildToolbar() {
    this.toolbar.textContent = '';

    this.playButton = el('button', 'primary', 'Play');
    this.playButton.addEventListener('click', () => this.sim.toggle());

    const stepBtn = el('button', null, 'Step');
    stepBtn.addEventListener('click', () => {
      this.sim.pause();
      this.sim.step();
    });

    const resetBtn = el('button', null, 'Reset');
    resetBtn.addEventListener('click', () => this.sim.reset());

    const clearBtn = el('button', null, 'Clear');
    clearBtn.addEventListener('click', () => this.sim.clear());

    const reseedBtn = el('button', null, 'Reseed');
    reseedBtn.addEventListener('click', () => {
      this.config.set('seed', Math.floor(Math.random() * 1000000));
      this.sim.reset();
    });

    this.toolbar.append(this.playButton, stepBtn, resetBtn, clearBtn, reseedBtn);
  }

  _updatePlayButton() {
    this.playButton.textContent = this.sim.running ? 'Pause' : 'Play';
  }

  // --------------------------------------------------------------- status
  _buildStatus() {
    const fields = [
      ['step', 'step'],
      ['rate', 'steps/s'],
      ['active', 'active'],
      ['err', 'mean |e|'],
      ['energy', 'Σe²'],
      ['integral', 'mean I'],
    ];
    this.statusRoot.textContent = '';
    for (const [key, label] of fields) {
      const item = el('div', 'stat');
      item.appendChild(el('span', 'stat-label', label));
      const value = el('span', 'stat-value', '–');
      item.appendChild(value);
      this._statusFields[key] = value;
      this.statusRoot.appendChild(item);
    }
  }

  updateStatus() {
    const s = this.sim.stats;
    const f = this._statusFields;
    f.step.textContent = String(s.step);
    f.rate.textContent = this.sim.running ? this.sim.measuredRate.toFixed(1) : '0.0';
    f.active.textContent = (s.activeFraction * 100).toFixed(1) + '%';
    f.err.textContent = s.meanAbsError.toFixed(3);
    f.energy.textContent = s.energy.toFixed(0);
    f.integral.textContent = s.meanIntegral.toFixed(3);
  }

  // ---------------------------------------------------------------- panel
  _buildPanel() {
    this.panel.textContent = '';
    this.panel.appendChild(this._buildPresetSection());

    for (const group of GROUPS) {
      const keys = Object.keys(SCHEMA).filter((k) => SCHEMA[k].group === group);
      if (!keys.length) continue;
      const section = el('section', 'group');
      section.appendChild(el('h2', null, group));
      for (const key of keys) section.appendChild(this._buildControl(key, SCHEMA[key]));
      this.panel.appendChild(section);
    }

    this.errorBox = el('p', 'errors');
    this.panel.appendChild(this.errorBox);
  }

  _buildPresetSection() {
    const section = el('section', 'group');
    section.appendChild(el('h2', null, 'Presets & sharing'));

    const select = el('select');
    this.presets.forEach((preset, index) => {
      const option = el('option');
      option.value = String(index);
      option.textContent = preset.name;
      select.appendChild(option);
    });
    section.appendChild(select);

    const description = el(
      'p',
      'hint',
      this.presets.length ? this.presets[0].description || '' : ''
    );
    select.addEventListener('change', () => {
      const preset = this.presets[Number(select.value)];
      description.textContent = preset ? preset.description || '' : '';
    });
    section.appendChild(description);

    const row = el('div', 'row');
    const loadBtn = el('button', 'primary', 'Load preset');
    loadBtn.addEventListener('click', () => {
      const preset = this.presets[Number(select.value)];
      if (!preset) return;
      this.config.patch(preset.config);
      this.sim.reset();
    });

    const shareBtn = el('button', null, 'Copy share link');
    shareBtn.addEventListener('click', async () => {
      const hash = toHashString(this.config.toJSON());
      history.replaceState(null, '', '#' + hash);
      const url = location.href;
      try {
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = 'Copied!';
      } catch (err) {
        shareBtn.textContent = 'URL updated';
      }
      setTimeout(() => {
        shareBtn.textContent = 'Copy share link';
      }, 1400);
    });
    row.append(loadBtn, shareBtn);
    section.appendChild(row);

    const textarea = el('textarea');
    textarea.rows = 7;
    textarea.spellcheck = false;
    textarea.placeholder = 'Configuration JSON (export / import)';
    section.appendChild(textarea);

    const ioRow = el('div', 'row');
    const exportBtn = el('button', null, 'Export JSON');
    exportBtn.addEventListener('click', () => {
      textarea.value = JSON.stringify(this.config.toJSON(), null, 2);
    });
    const importBtn = el('button', null, 'Import JSON');
    importBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(textarea.value);
        const errors = this.config.loadJSON(parsed);
        this.sim.reset();
        this._showErrors(errors);
      } catch (err) {
        this._showErrors(['could not parse JSON: ' + err.message]);
      }
    });
    ioRow.append(exportBtn, importBtn);
    section.appendChild(ioRow);

    return section;
  }

  _buildControl(key, spec) {
    const row = el('div', 'ctl');
    const label = el('label', 'ctl-label', spec.label);
    label.setAttribute('for', 'ctl-' + key);
    row.appendChild(label);

    const field = el('div', 'ctl-field');
    let setValue;

    if (spec.type === 'bool') {
      const box = el('input');
      box.type = 'checkbox';
      box.id = 'ctl-' + key;
      box.addEventListener('change', () => this._push(key, box.checked));
      field.appendChild(box);
      setValue = (v) => {
        box.checked = Boolean(v);
      };
    } else if (spec.type === 'enum') {
      const select = el('select');
      select.id = 'ctl-' + key;
      for (const option of spec.options) {
        const opt = el('option');
        opt.value = String(option);
        opt.textContent =
          (spec.optionLabels && spec.optionLabels[String(option)]) || String(option);
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        const match = spec.options.find((o) => String(o) === select.value);
        this._push(key, match);
      });
      field.appendChild(select);
      setValue = (v) => {
        select.value = String(v);
      };
    } else {
      const range = el('input', 'ctl-range');
      range.type = 'range';
      range.id = 'ctl-' + key;
      range.min = spec.min;
      range.max = spec.max;
      range.step = spec.step || 1;

      const number = el('input', 'ctl-num');
      number.type = 'number';
      number.min = spec.min;
      number.max = spec.max;
      number.step = spec.step || 1;

      range.addEventListener('input', () => {
        number.value = range.value;
        this._push(key, Number(range.value));
      });
      number.addEventListener('change', () => {
        range.value = number.value;
        this._push(key, Number(number.value));
      });

      field.append(range, number);
      setValue = (v) => {
        range.value = v;
        number.value = v;
      };
    }

    row.appendChild(field);
    if (spec.hint) row.appendChild(el('div', 'ctl-hint', spec.hint));

    this.controls.set(key, { row, setValue, spec });
    return row;
  }

  _push(key, value) {
    if (this._applying || value === undefined) return;
    this.config.set(key, value);
    this._showErrors(this.config.errors);
  }

  _showErrors(errors) {
    if (!this.errorBox) return;
    this.errorBox.textContent = errors && errors.length ? errors.join(' · ') : '';
  }

  syncFromConfig() {
    const cfg = this.config.all();
    this._applying = true;
    for (const [key, control] of this.controls) {
      control.setValue(cfg[key]);
      control.row.hidden =
        typeof control.spec.visible === 'function' ? !control.spec.visible(cfg) : false;
    }
    this._applying = false;
    this._renderLegend();
  }

  _renderLegend() {
    const cfg = this.config.all();
    const root = this.legendRoot;
    if (!root) return;
    root.textContent = '';

    let names;
    if (cfg.stateCardinality === 2) names = ['inactive', 'active'];
    else if (cfg.expression === 'semantic')
      names = ['inactive', 'integral-dominant (stabilising)', 'P/D-dominant (driving)'];
    else names = ['state 0', 'state 1', 'state 2'];

    for (let s = 0; s < cfg.stateCardinality; s++) {
      const item = el('div', 'legend-item');
      const swatch = el('span', 'swatch');
      const c = STATE_COLORS[s] || STATE_COLORS[0];
      swatch.style.background = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      item.append(swatch, el('span', null, names[s]));
      root.appendChild(item);
    }

    if (cfg.overlay !== 'none') {
      const item = el('div', 'legend-item');
      item.append(
        el('span', 'swatch ramp'),
        el('span', null, 'overlay: ' + cfg.overlay + ' (blue −, red +), ±' + cfg.overlayScale)
      );
      root.appendChild(item);
    }
  }

  // -------------------------------------------------------------- painting
  _bindPainting() {
    let painting = false;
    let paintValue = 1;

    const cellOf = (event) => this.renderer.cellFromEvent(event, this.sim.grid);

    this.canvas.addEventListener('pointerdown', (event) => {
      const cell = cellOf(event);
      if (!cell) return;
      const cfg = this.config.all();
      const current = this.sim.grid.getState(cell.x, cell.y);
      paintValue =
        event.button === 2 || event.shiftKey ? 0 : current > 0 ? 0 : cfg.stateCardinality - 1;
      painting = true;
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      this.sim.paintCell(cell.x, cell.y, paintValue);
      event.preventDefault();
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!painting) return;
      const cell = cellOf(event);
      if (cell) this.sim.paintCell(cell.x, cell.y, paintValue);
    });

    const stop = () => {
      painting = false;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.addEventListener('pointerleave', stop);
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  _bindKeys() {
    window.addEventListener('keydown', (event) => {
      const tag = (event.target && event.target.tagName) || '';
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
      switch (event.key) {
        case ' ':
          event.preventDefault();
          this.sim.toggle();
          break;
        case 's':
        case 'S':
          this.sim.pause();
          this.sim.step();
          break;
        case 'r':
        case 'R':
          this.sim.reset();
          break;
        case 'c':
        case 'C':
          this.sim.clear();
          break;
        default:
          break;
      }
    });
  }
}
