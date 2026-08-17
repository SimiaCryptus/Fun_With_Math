import { qs, el, debounce } from './util/dom.js';
import { buildStack } from './core/sieveStack.js';
import { harmonicsForExactness } from './core/spectrum.js';
import { fmt, sci, fromLog10, bigStr } from './util/format.js';

import * as PrimeList from './ui/primeList.js';
import * as StackView from './ui/stackView.js';
import * as ObservationView from './ui/observationView.js';
import * as SpectrumView from './ui/spectrumView.js';
import * as WaveView from './ui/waveView.js';
import * as FlowView from './ui/flowView.js';
import * as CrtView from './ui/crtView.js';
import * as GapView from './ui/gapView.js';

const state = {
  k: 6,
  windowLength: 2310,
  offset: 1,
  harmonics: 6,
  waveWindow: 240,
  showRaw: true,
  logSpectrum: false,
  selected: 0,
};

const views = [
  PrimeList,
  StackView,
  ObservationView,
  SpectrumView,
  WaveView,
  FlowView,
  CrtView,
  GapView,
];
let stack = null;

const app = {
  state,
  onSelect(i) {
    state.selected = Math.max(0, Math.min(stack.basis.length - 1, i));
    render();
  },
};

function recompute() {
  stack = buildStack(state);
  state.selected = Math.min(state.selected, stack.basis.length - 1);
  render();
}

function render() {
  for (const v of views) v.render(stack, state);
  readout();
}

function readout() {
  const host = qs('#readout');
  host.innerHTML = '';
  const chip = (k, v, title) =>
    host.appendChild(
      el('span', { class: 'chip', title: title || '' }, [`${k} `, el('b', {}, [v])])
    );

  const last = stack.stages[stack.stages.length - 1];
  chip('p_k =', String(stack.pk), 'largest prime in the basis');
  chip('L_k =', bigStr(stack.L, 22), 'period of the stacked field (primorial)');
  chip('digits(L_k) =', String(Math.floor(stack.log10L) + 1));
  chip('ρ_k =', sci(stack.rho, 6), 'exact Mertens survivor density');
  chip(
    'survivors/window =',
    `${stack.survivors}/${stack.N} = ${fmt(stack.survivors / stack.N, 6)}`
  );
  chip('H_joint =', `${fmt(stack.Hjoint, 4)} bits`, 'Σ H(p_i): additive by CRT independence');
  chip(
    'h_k =',
    `${fromLog10(last ? last.log10EntropyDensity : NaN)} b/int`,
    'joint entropy per integer of period'
  );
  chip(
    'H_out =',
    `${fmt(last ? last.outputEntropy : 0, 4)} bits`,
    'entropy of the single output bit S_k(n) → 0'
  );
  chip('nonzero harmonics =', String(stack.stages.reduce((a, s) => a + s.combLines, 0)));
  chip(
    'exact from H ≥',
    String(harmonicsForExactness(stack.basis)),
    'harmonics needed for the wave view to be exact'
  );
}

function bindControls() {
  const k = qs('#k'),
    kOut = qs('#kOut');
  k.addEventListener('input', () => {
    state.k = +k.value;
    kOut.textContent = k.value;
    recompute();
  });

  qs('#window').addEventListener('change', (e) => {
    state.windowLength = +e.target.value;
    recompute();
  });

  qs('#offset').addEventListener('change', (e) => {
    state.offset = Math.max(1, Math.floor(+e.target.value || 1));
    e.target.value = state.offset;
    recompute();
  });

  const H = qs('#harmonics'),
    hOut = qs('#hOut');
  H.addEventListener('input', () => {
    state.harmonics = +H.value;
    hOut.textContent = H.value;
    WaveView.render(stack, state);
    readout();
  });

  qs('#showRaw').addEventListener('change', (e) => {
    state.showRaw = e.target.checked;
    StackView.render(stack, state);
  });

  qs('#logSpectrum').addEventListener('change', (e) => {
    state.logSpectrum = e.target.checked;
    SpectrumView.render(stack, state);
  });

  // keyboard: step the selected prime
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') app.onSelect(state.selected + 1);
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') app.onSelect(state.selected - 1);
  });

  window.addEventListener(
    'resize',
    debounce(() => render(), 120)
  );
}

for (const v of views) v.mount && v.mount(app);
bindControls();
recompute();
