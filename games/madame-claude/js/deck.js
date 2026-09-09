export const REVERSED_RATE = 0.3;

export async function loadCards(url = 'data/cards.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load cards (${res.status})`);
  const cards = await res.json();
  if (!Array.isArray(cards) || cards.length !== 78) {
    console.warn(`Expected 78 cards, got ${cards?.length}`);
  }
  return cards;
}

/**
 * Fisher–Yates shuffle followed by one orientation draw per card.
 * Returns [{ card, reversed }] — the whole deck, top card first.
 */
export function shuffle(cards, rng, reversedRate = REVERSED_RATE) {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map((card) => ({ card, reversed: rng() < reversedRate }));
}

/** Deal the top N cards into the spread's positions. */
export function deal(shuffled, spread) {
  return spread.positions.map((position, index) => ({
    position,
    index,
    card: shuffled[index].card,
    reversed: shuffled[index].reversed,
  }));
}