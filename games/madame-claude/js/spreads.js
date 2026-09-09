// Spread definitions. x/y are percentage offsets of the card centre within the
// spread container; `role` selects prose templates in the built-in interpreter.

const pos = (id, label, role, description, x, y, extra = {}) =>
  ({ id, label, role, description, x, y, ...extra });

export const SPREADS = {
  single: {
    id: 'single',
    name: 'Single Card',
    description: 'One card, one answer.',
    positions: [
      pos('answer', 'The Answer', 'answer', 'The heart of the matter, in a single image.', 50, 50),
    ],
  },
  three: {
    id: 'three',
    name: 'Three Card',
    description: 'Past, present and future.',
    positions: [
      pos('past', 'Past', 'past', 'What has shaped the situation.', 18, 50),
      pos('present', 'Present', 'present', 'Where things stand now.', 50, 50),
      pos('future', 'Future', 'future', 'Where the current path leads.', 82, 50),
    ],
  },
  celtic: {
    id: 'celtic',
    name: 'Celtic Cross',
    description: 'The classic ten-card spread.',
    positions: [
      pos('situation', 'Situation', 'situation', 'The present circumstance at the centre.', 30, 50),
      pos('challenge', 'Challenge', 'challenge', 'What crosses you — the obstacle or tension.', 30, 50, { rotate: true }),
      pos('root', 'Root', 'root', 'The foundation beneath the matter.', 30, 86),
      pos('past', 'Past', 'past', 'What is passing away.', 9, 50),
      pos('crown', 'Crown', 'crown', 'What is possible, or consciously hoped for.', 30, 14),
      pos('near-future', 'Near Future', 'future', 'What approaches next.', 51, 50),
      pos('self', 'Self', 'self', 'How you see yourself in this.', 78, 89),
      pos('environment', 'Environment', 'environment', 'People and forces around you.', 78, 63),
      pos('hopes-fears', 'Hopes / Fears', 'hopes-fears', 'What you long for and dread — often the same thing.', 78, 37),
      pos('outcome', 'Outcome', 'outcome', 'Where this is tending, if nothing changes.', 78, 11),
    ],
  },
};

export const DEFAULT_SPREAD = 'three';

export function getSpread(id) {
  return SPREADS[id] || SPREADS[DEFAULT_SPREAD];
}