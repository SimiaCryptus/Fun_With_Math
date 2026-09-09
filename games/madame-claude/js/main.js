import { loadCards, shuffle, deal } from './deck.js';
import { getSpread } from './spreads.js';
import {
  getLocation, localDate, buildDefaultSeed, seedToHash, hashToShareSeed, rngFromHash, deriveRng,
} from './seed.js';
import { interpret } from './interpreter.js';
import { streamReading, describeError } from './anthropic.js';
import { initParlor, animateShuffle, prefersReducedMotion } from './ui/parlor.js';
import { initConsult } from './ui/consult.js';
import { renderSpread } from './ui/spread.js';
import { initReading } from './ui/reading.js';

const $ = (sel) => document.querySelector(sel);
const els = {
  greeting: $('#greeting'),
  form: $('#consult-form'),
  table: $('#table'),
  deck: $('#deck'),
  spread: $('#spread'),
  status: $('#spread-status'),
  revealAll: $('#reveal-all'),
  askAgain: $('#ask-again'),
  reading: $('#reading'),
};

let cards;
let templates;
try {
  [cards, templates] = await Promise.all([
    loadCards('data/cards.json'),
    fetch('data/templates.json').then((r) => {
      if (!r.ok) throw new Error(`templates ${r.status}`);
      return r.json();
    }),
  ]);
} catch (err) {
  els.greeting.textContent = 'The parlor is dark tonight — the cards could not be found. (Serve this folder over HTTP.)';
  throw err;
}

initParlor({ greetingEl: els.greeting, date: localDate() });

const reading = initReading({
  panel: els.reading,
  titleEl: $('#reading-title'),
  noteEl: $('#reading-note'),
  textEl: $('#reading-text'),
  copyBtn: $('#copy-btn'),
  shareBtn: $('#share-btn'),
  saveBtn: $('#save-btn'),
  feedbackEl: $('#reading-feedback'),
});

const consult = initConsult({ form: els.form, onConsult: beginReading });

let spreadView = null;
let abortCtrl = null;

function buildShareUrl(spreadId, hash) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ spread: spreadId, seed: hashToShareSeed(hash) }).toString();
  url.hash = '';
  return url.toString();
}

function scrollTo(el) {
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

async function beginReading(state) {
  consult.setBusy(true);
  abortCtrl?.abort();
  spreadView?.destroy();
  reading.reset();

  const spread = getSpread(state.spread);
  const date = localDate();
  let seedString = state.seed;
  if (!seedString) {
    const place = await getLocation();
    seedString = buildDefaultSeed({ location: place, date, input: state.input });
  }
  const hash = seedToHash(seedString);
  const dealt = deal(shuffle(cards, rngFromHash(hash)), spread);
  const shareUrl = buildShareUrl(spread.id, hash);

  els.table.hidden = false;
  els.spread.hidden = true;
  els.revealAll.hidden = true;
  els.askAgain.hidden = true;
  scrollTo(els.table);
  await animateShuffle(els.deck);

  spreadView = renderSpread({
    container: els.spread,
    statusEl: els.status,
    spread,
    dealt,
    onAllRevealed: () => {
      els.revealAll.hidden = true;
      produceReading({ spread, dealt, hash, state, date, shareUrl });
    },
  });
  els.revealAll.hidden = false;
  els.askAgain.hidden = false;
  consult.setBusy(false);
  els.spread.querySelector('.card')?.focus({ preventScroll: true });
}

async function produceReading({ spread, dealt, hash, state, date, shareUrl }) {
  reading.start({ title: `${spread.name} reading`, shareUrl });
  setTimeout(() => scrollTo(els.reading), 400);

  const builtIn = () => interpret({ spread, dealt, templates, rng: deriveRng(hash, 'reading') });

  if (!state.apiKey) {
    reading.setText(builtIn());
    reading.finish({ source: "Madame Claude's own hand (built-in interpreter)" });
    return;
  }

  abortCtrl = new AbortController();
  const { signal } = abortCtrl;
  reading.setNote('Madame Claude closes her eyes and listens…');
  try {
    const text = await streamReading({
      apiKey: state.apiKey,
      model: state.model,
      spread, dealt, date,
      input: state.input,
      signal,
      onChunk: (chunk) => reading.append(chunk),
    });
    if (!text.trim()) throw new Error('empty response');
    reading.finish({ source: `Madame Claude (${state.model})` });
  } catch (err) {
    if (signal.aborted) return;
    console.warn('Falling back to built-in interpreter:', err);
    reading.setText(`The spirits are quiet tonight… let me read the cards myself.\n\n${builtIn()}`);
    reading.finish({ error: describeError(err) });
  }
}

els.revealAll.addEventListener('click', () => spreadView?.revealAll());

els.askAgain.addEventListener('click', () => {
  abortCtrl?.abort();
  spreadView?.destroy();
  spreadView = null;
  reading.reset();
  els.table.hidden = true;
  els.revealAll.hidden = true;
  els.askAgain.hidden = true;
  if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  scrollTo(els.form);
  consult.focus();
});

// A share link opens straight onto the table.
if (consult.fromLink) consult.submit();