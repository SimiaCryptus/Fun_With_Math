import { cyrb53 } from '../seed.js';

const GREETINGS = [
  'Ah — come in, come in. The candles knew you were coming before I did.',
  'Sit. The cards have been restless all evening; perhaps they were waiting for you.',
  'Welcome, traveller. Leave the rain at the door and your certainties with it.',
  'The kettle is on, the deck is warm. Tell me what the night has brought you.',
  'You found the parlor. Most people who find it needed to. Please, sit.',
  'Every visitor brings a question, even the ones who say they have none.',
];

export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sets a greeting that stays the same for the whole day. */
export function initParlor({ greetingEl, date }) {
  const idx = cyrb53(date) % GREETINGS.length;
  greetingEl.textContent = GREETINGS[idx];
}

/** Plays the deck shuffle animation (or skips it under reduced motion). */
export async function animateShuffle(deckEl) {
  deckEl.hidden = false;
  if (prefersReducedMotion()) {
    await wait(120);
  } else {
    deckEl.classList.add('is-shuffling');
    await wait(950);
    deckEl.classList.remove('is-shuffling');
  }
  deckEl.hidden = true;
}