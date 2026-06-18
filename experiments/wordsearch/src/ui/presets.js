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
      'universe its galaxies and the quantum particles that make up everything we know ' +
      'biologists study genes and proteins while chemists mix acids and bases in the ' +
      'laboratory and physicists measure the speed of light across the vacuum of space',
    words: ['atom', 'energy', 'planet', 'cell', 'gravity', 'molecule', 'photon', 'gene'],
  },
  fantasy: {
    label: 'Fantasy',
    referenceText:
      'beyond the misty mountains the brave knight rode toward the ancient castle where ' +
      'a sleeping dragon guarded a hoard of gold and a wise wizard cast spells of fire ' +
      'and frost while elves and dwarves gathered in the enchanted forest to seek the ' +
      'lost crown of the fallen kingdom and the magic sword that could break the curse ' +
      'binding the realm in eternal shadow a wandering bard sang of heroes and quests ' +
      'while a hidden potion glowed within the tower and the dark sorcerer summoned ' +
      'shadows from the depths to challenge the chosen warrior of the silver shield',
    words: ['dragon', 'wizard', 'castle', 'sword', 'magic', 'knight', 'potion', 'elf'],
  },
  kids: {
    label: 'Kids',
    referenceText:
      'the happy puppy played with a red ball in the sunny park while a little kitten ' +
      'chased butterflies near the flowers a friendly bear shared honey with his pals ' +
      'and the children laughed as they ran and jumped and sang silly songs all day ' +
      'long before going home to eat tasty cookies and drink warm milk and sleep tight ' +
      'a yellow duck swam in the pond and a fluffy bunny hopped along the grassy hill ' +
      'while the kids built a sandy castle and flew a bright kite high up in the sky',
    words: ['puppy', 'kitten', 'ball', 'bear', 'honey', 'duck', 'bunny', 'kite'],
  },
  computers: {
    label: 'Computers',
    referenceText:
      'the computer processes data using a central processor and stores information in ' +
      'memory while software programs run code that the machine executes byte by byte ' +
      'across the network packets travel between servers and clients as algorithms sort ' +
      'and search through arrays the keyboard sends input to the screen and the internet ' +
      'connects millions of devices sharing files through the cloud every single second ' +
      'developers write functions and debug errors while the compiler turns source into ' +
      'binary and the database stores records that queries fetch from indexed tables',
    words: ['computer', 'memory', 'code', 'network', 'server', 'data', 'pixel', 'cloud'],
  },
  nature: {
    label: 'Nature',
    referenceText:
      'tall trees sway in the gentle breeze as rivers wind through green valleys and ' +
      'mountains rise against the clear blue sky birds sing from the forest canopy ' +
      'while deer graze in the meadow and fish swim in the cool clear streams the sun ' +
      'warms the earth and rain nourishes the flowers that bloom across the rolling ' +
      'hills where bees buzz between the petals and the wind carries seeds far away',
    words: ['tree', 'river', 'mountain', 'forest', 'flower', 'bird', 'meadow', 'rain'],
  },
  space: {
    label: 'Space',
    referenceText:
      'the rocket launched into orbit carrying astronauts toward the distant station ' +
      'where they studied the moon and gazed at the red planet mars through powerful ' +
      'telescopes comets streaked across the dark sky and a bright nebula glowed near ' +
      'a cluster of ancient stars while satellites circled the earth gathering data ' +
      'about the vast galaxy and the mysterious black holes hidden in deep space',
    words: ['rocket', 'orbit', 'moon', 'mars', 'comet', 'nebula', 'star', 'galaxy'],
  },
  ocean: {
    label: 'Ocean',
    referenceText:
      'deep beneath the rolling waves the whale glides past coral reefs where colorful ' +
      'fish dart between the swaying kelp and a curious dolphin leaps above the surface ' +
      'while crabs scuttle across the sandy floor and the tide pulls shells along the ' +
      'shore sharks patrol the open water as jellyfish drift with the gentle current ' +
      'and an octopus hides among the rocks in the cool blue depths of the vast sea',
    words: ['whale', 'coral', 'dolphin', 'shark', 'tide', 'shell', 'octopus', 'wave'],
  },
  food: {
    label: 'Food',
    referenceText:
      'the chef chopped fresh tomatoes and onions to make a savory sauce while bread ' +
      'baked in the warm oven and cheese melted over a slice of hot pizza the kitchen ' +
      'filled with the aroma of garlic and herbs as soup simmered on the stove and a ' +
      'sweet cake cooled on the counter friends gathered around the table to share a ' +
      'meal of pasta salad and fruit with cold drinks and laughter late into the night',
    words: ['bread', 'cheese', 'pizza', 'soup', 'cake', 'pasta', 'fruit', 'salad'],
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
