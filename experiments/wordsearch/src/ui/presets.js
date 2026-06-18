// Selectable presets: reference text corpora and target word lists.
// Each preset supplies a reference text (to train the Markov model) and a
// list of target words to hide in the grid.
//
// Individual presets now live in ./presets/<name>.js and are aggregated here.

import { science } from './presets/science.js';
import { fantasy } from './presets/fantasy.js';
import { kids } from './presets/kids.js';
import { computers } from './presets/computers.js';
import { nature } from './presets/nature.js';
import { space } from './presets/space.js';
import { ocean } from './presets/ocean.js';
import { food } from './presets/food.js';

export const PRESETS = {
  science,
  fantasy,
  kids,
  computers,
  nature,
  space,
  ocean,
  food,
};

export const DEFAULT_PRESET = 'fantasy';

/** Apply a preset's text + words to the relevant form controls. */
export function applyPreset(root, presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;
  const textEl = root.querySelector('#cfg-reftext');
  const wordsEl = root.querySelector('#cfg-words');
  if (textEl) textEl.value = preset.referenceText;
  if (wordsEl) wordsEl.value = preset.words.join('\n');
}

/** Populate a <select> element with preset options. */
export function populatePresetSelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  for (const [key, preset] of Object.entries(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = preset.label;
    if (key === DEFAULT_PRESET) opt.selected = true;
    selectEl.appendChild(opt);
  }
}
