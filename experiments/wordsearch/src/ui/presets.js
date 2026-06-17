// Selectable presets: reference text corpora and target word lists.
// Each preset supplies a reference text (to train the Markov model) and a
// list of target words to hide in the grid.

export const PRESETS = {
  science: {
    label: 'Science',
    referenceText:
      'energy flows through every living system as cells divide and molecules react ' +
      'under the laws of physics and chemistry while gravity pulls planets around ' +
      'distant stars and electrons orbit the nucleus of each atom experiments reveal ' +
      'how matter behaves and scientists observe nature to form theories about the ' +
      'universe its galaxies and the quantum particles that make up everything we know',
    words: ['atom', 'energy', 'planet', 'cell', 'gravity'],
  },
  fantasy: {
    label: 'Fantasy',
    referenceText:
      'beyond the misty mountains the brave knight rode toward the ancient castle where ' +
      'a sleeping dragon guarded a hoard of gold and a wise wizard cast spells of fire ' +
      'and frost while elves and dwarves gathered in the enchanted forest to seek the ' +
      'lost crown of the fallen kingdom and the magic sword that could break the curse ' +
      'binding the realm in eternal shadow',
    words: ['dragon', 'wizard', 'castle', 'sword', 'magic'],
  },
  kids: {
    label: 'Kids',
    referenceText:
      'the happy puppy played with a red ball in the sunny park while a little kitten ' +
      'chased butterflies near the flowers a friendly bear shared honey with his pals ' +
      'and the children laughed as they ran and jumped and sang silly songs all day ' +
      'long before going home to eat tasty cookies and drink warm milk and sleep tight',
    words: ['puppy', 'kitten', 'ball', 'bear', 'honey'],
  },
  computers: {
    label: 'Computers',
    referenceText:
      'the computer processes data using a central processor and stores information in ' +
      'memory while software programs run code that the machine executes byte by byte ' +
      'across the network packets travel between servers and clients as algorithms sort ' +
      'and search through arrays the keyboard sends input to the screen and the internet ' +
      'connects millions of devices sharing files through the cloud every single second',
    words: ['computer', 'memory', 'code', 'network', 'server'],
  },
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
