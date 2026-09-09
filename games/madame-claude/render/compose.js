import { cyrb53, mulberry32 } from '../js/seed.js';
import { drawSymbol } from './symbols/index.js';
import { frame, backFrame, accentFor, SUIT_GLYPH, W, H } from './frame.js';
import { GOLD, darken, lighten, withAlpha } from './palette.js';

const f = (n) => Number(n.toFixed(1));

function svgDoc(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

function background(bg, accent, light, rng) {
  const dots = Array.from({ length: 70 }, () => {
    const x = 40 + rng() * (W - 80);
    const y = 40 + rng() * (H - 80);
    const r = 0.5 + rng() * 1.6;
    const a = 0.12 + rng() * 0.45;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${light}" opacity="${f(a)}"/>`;
  }).join('');
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${lighten(bg, 0.08)}"/>
        <stop offset="1" stop-color="${darken(bg, 0.45)}"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.45" r="0.55">
        <stop offset="0" stop-color="${withAlpha(accent, 0.28)}"/>
        <stop offset="1" stop-color="${withAlpha(accent, 0)}"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${dots}
    <ellipse cx="${W / 2}" cy="720" rx="250" ry="55" fill="${darken(bg, 0.3)}" opacity="0.55"/>`;
}

function halo(cx, cy, r, accent, light) {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${withAlpha(light, 0.07)}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${withAlpha(accent, 0.4)}" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="none" stroke="${withAlpha(accent, 0.2)}" stroke-width="1"/>`;
}

const EXTRA_SLOTS = [[135, 205], [365, 205], [135, 640], [365, 640], [250, 165]];
const jitter = (rng, amt) => (rng() - 0.5) * 2 * amt;

function majorScene(card, c, rng) {
  const [main, ...extras] = card.art.symbols;
  const parts = [halo(250, 430, 185, c.line, c.fill)];
  parts.push(drawSymbol(main, 250, 430, 250, c));
  extras.slice(0, EXTRA_SLOTS.length).forEach((name, i) => {
    const [x, y] = EXTRA_SLOTS[i];
    parts.push(drawSymbol(name, x + jitter(rng, 8), y + jitter(rng, 8), 82 + jitter(rng, 8), c, 0.9));
  });
  return parts.join('');
}

function pipPositions(n) {
  if (n === 1) return [[250, 430, 230]];
  const cols = n <= 3 ? 1 : n <= 8 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const top = 200, bottom = 665;
  const rowGap = rows > 1 ? (bottom - top) / (rows - 1) : 0;
  const colX = { 1: [250], 2: [165, 335], 3: [130, 250, 370] };
  const size = Math.min(cols === 1 ? 165 : cols === 2 ? 118 : 96, rowGap ? rowGap * 0.82 : 200);
  const pts = [];
  let remaining = n;
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, remaining);
    const xs = colX[inRow];
    const y = rows > 1 ? top + r * rowGap : 430;
    xs.forEach((x) => pts.push([x, y, size]));
    remaining -= inRow;
  }
  return pts;
}

function pipScene(card, c, rng) {
  const glyph = SUIT_GLYPH[card.suit];
  const parts = [];
  if (card.number === 1) parts.push(halo(250, 430, 175, c.line, c.fill));
  for (const [x, y, s] of pipPositions(card.number)) {
    parts.push(drawSymbol(glyph, x + jitter(rng, 3), y + jitter(rng, 3), s, c));
  }
  const extras = card.art.symbols.slice(0, 2);
  const spots = extras.length === 1 ? [[250, 140]] : [[110, 150], [390, 150]];
  extras.forEach((name, i) => parts.push(drawSymbol(name, spots[i][0], spots[i][1], 50, c, 0.75)));
  return parts.join('');
}

function courtScene(card, c, rng) {
  const rank = card.number;
  const glyph = SUIT_GLYPH[card.suit];
  const parts = [halo(250, 430, 185, c.line, c.fill)];
  if (rank === 12) parts.push(drawSymbol('wings', 250, 400, 330, c, 0.55));
  parts.push(drawSymbol('figure', 250, 440, 250, c));
  if (rank >= 13) parts.push(drawSymbol('crown', 250, 300 - (rank - 13) * 8, rank === 14 ? 92 : 72, c));
  parts.push(drawSymbol(glyph, 352, 470, 96, c));
  const spots = [[125, 215], [375, 215]];
  card.art.symbols.slice(0, 2).forEach((name, i) => {
    parts.push(drawSymbol(name, spots[i][0] + jitter(rng, 6), spots[i][1] + jitter(rng, 6), 70, c, 0.85));
  });
  return parts.join('');
}

export function composeCard(card) {
  const rng = mulberry32(cyrb53(card.id) >>> 0);
  const [bg, accent, light] = card.art.palette;
  const colors = { line: accent, fill: light, bg };
  const scene = card.arcana === 'major'
    ? majorScene(card, colors, rng)
    : card.number <= 10 ? pipScene(card, colors, rng) : courtScene(card, colors, rng);
  return svgDoc([background(bg, accent, light, rng), scene, frame(card)].join('\n'));
}

export function composeBack() {
  const rng = mulberry32(cyrb53('card-back') >>> 0);
  const bg = '#1a0d1c';
  const colors = { line: GOLD, fill: withAlpha('#f4e9d2', 0.9), bg };
  return svgDoc(`
    <defs>
      <pattern id="lattice" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="44" height="44" fill="${bg}"/>
        <rect x="0" y="0" width="22" height="22" fill="${withAlpha(GOLD, 0.10)}"/>
        <rect x="22" y="22" width="22" height="22" fill="${withAlpha(GOLD, 0.10)}"/>
        <circle cx="22" cy="22" r="2" fill="${withAlpha(GOLD, 0.45)}"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#lattice)"/>
    ${halo(250, 450, 190, GOLD, '#f4e9d2')}
    ${drawSymbol('moon', 250, 450, 220, colors, 0.95)}
    ${drawSymbol('star', 320, 380, 70, colors)}
    ${drawSymbol('star', 180 + jitter(rng, 4), 560, 46, colors, 0.8)}
    ${drawSymbol('eye', 250, 760, 60, colors, 0.7)}
    ${drawSymbol('eye', 250, 140, 60, colors, 0.7)}
    ${backFrame()}
  `);
}