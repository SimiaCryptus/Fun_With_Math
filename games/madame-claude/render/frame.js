import { GOLD, SUIT_ACCENT, withAlpha } from './palette.js';
import { drawSymbol } from './symbols/index.js';

export const W = 500;
export const H = 900;
export const FONT = "Georgia, 'Times New Roman', 'DejaVu Serif', serif";

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const COURT = { 11: 'Page', 12: 'Knight', 13: 'Queen', 14: 'King' };
export const SUIT_GLYPH = { wands: 'wand', cups: 'cup', swords: 'sword', pentacles: 'pentacle' };

export function accentFor(card) {
  return card.arcana === 'major' ? GOLD : SUIT_ACCENT[card.suit] || GOLD;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cornerOrnaments(accent) {
  const pts = [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]];
  return pts.map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${accent}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="2.5" fill="${accent}"/>`).join('');
}

export function frame(card) {
  const accent = accentFor(card);
  const light = card.art.palette[2];
  const isMajor = card.arcana === 'major';
  const top = isMajor ? ROMAN[card.number] : card.number <= 10 ? ROMAN[card.number] : COURT[card.number];
  const name = escapeXml(card.name);
  const nameSize = card.name.length > 17 ? 30 : 36;
  const glyphColors = { line: accent, fill: withAlpha(light, 0.85), bg: card.art.palette[0] };

  const suitGlyphs = isMajor ? '' : [
    drawSymbol(SUIT_GLYPH[card.suit], 64, 76, 32, glyphColors),
    drawSymbol(SUIT_GLYPH[card.suit], W - 64, 76, 32, glyphColors),
  ].join('');

  return `
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="22" fill="none" stroke="${accent}" stroke-width="${isMajor ? 8 : 6}"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" rx="14" fill="none" stroke="${withAlpha(light, 0.45)}" stroke-width="1.5"/>
    ${cornerOrnaments(accent)}
    ${suitGlyphs}
    <text x="${W / 2}" y="92" text-anchor="middle" font-family="${FONT}" font-size="34" letter-spacing="4" fill="${light}">${top}</text>
    <rect x="44" y="${H - 148}" width="${W - 88}" height="92" rx="10" fill="rgba(0,0,0,0.42)" stroke="${accent}" stroke-width="2"/>
    <text x="${W / 2}" y="${H - 90}" text-anchor="middle" font-family="${FONT}" font-size="${nameSize}" letter-spacing="1.5" fill="${light}">${name}</text>
    <line x1="120" y1="${H - 74}" x2="${W - 120}" y2="${H - 74}" stroke="${accent}" stroke-width="1.5"/>`;
}

export function backFrame() {
  return `
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="22" fill="none" stroke="${GOLD}" stroke-width="8"/>
    <rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="14" fill="none" stroke="${withAlpha(GOLD, 0.55)}" stroke-width="2"/>
    ${cornerOrnaments(GOLD)}`;
}