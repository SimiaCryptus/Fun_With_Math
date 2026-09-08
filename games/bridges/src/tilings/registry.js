import triangle from './triangle.js';
import hex from './hex.js';
import square from './square.js';
import truncSquare from './truncSquare.js';
import triHex from './triHex.js';
import rhombiTriHex from './rhombiTriHex.js';
import snubSquare from './snubSquare.js';
import truncHex from './truncHex.js';
import truncTriHex from './truncTriHex.js';
import cairo from './cairo.js';
import brick from './brick.js';

export const tilingList = [
  triangle, hex, square, truncSquare, triHex,
  rhombiTriHex, snubSquare, truncHex, truncTriHex, cairo, brick,
];
export const tilings = Object.fromEntries(tilingList.map(t => [t.id, t]));
export const tilingIds = tilingList.map(t => t.id);