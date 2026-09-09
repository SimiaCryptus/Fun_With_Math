import { SPREADS, DEFAULT_SPREAD } from '../spreads.js';
import { DEFAULT_MODEL } from '../anthropic.js';
import { loadApiKey, saveApiKey, isRemembered, loadModel, saveModel } from '../storage.js';

export function initConsult({ form, onConsult }) {
  const f = {
    input: form.querySelector('#input'),
    spread: form.querySelector('#spread-select'),
    seed: form.querySelector('#seed'),
    apiKey: form.querySelector('#api-key'),
    remember: form.querySelector('#remember'),
    model: form.querySelector('#model'),
    submit: form.querySelector('#consult-btn'),
    settings: form.querySelector('#settings'),
  };

  for (const s of Object.values(SPREADS)) {
    f.spread.add(new Option(`${s.name} (${s.positions.length})`, s.id));
  }
  f.spread.value = DEFAULT_SPREAD;

  // Restore remembered settings.
  f.apiKey.value = loadApiKey();
  f.remember.checked = isRemembered();
  f.model.value = loadModel() || DEFAULT_MODEL;

  // Share links: ?spread=…&seed=h:…
  const params = new URLSearchParams(window.location.search);
  const fromLink = params.has('seed');
  if (params.get('spread') && SPREADS[params.get('spread')]) f.spread.value = params.get('spread');
  if (fromLink) {
    f.seed.value = params.get('seed');
    f.settings.open = true;
  }

  const persistKey = () => saveApiKey(f.apiKey.value.trim(), f.remember.checked);
  f.apiKey.addEventListener('change', persistKey);
  f.remember.addEventListener('change', persistKey);
  f.model.addEventListener('change', () => saveModel(f.model.value.trim()));

  const getState = () => ({
    input: f.input.value,
    spread: f.spread.value,
    seed: f.seed.value.trim(),
    apiKey: f.apiKey.value.trim(),
    model: f.model.value.trim() || DEFAULT_MODEL,
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    persistKey();
    onConsult(getState());
  });

  return {
    getState,
    fromLink,
    setBusy(busy) {
      f.submit.disabled = busy;
      f.submit.textContent = busy ? 'Shuffling…' : 'Consult the cards';
    },
    focus() {
      f.input.focus({ preventScroll: false });
    },
    submit() {
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    },
  };
}