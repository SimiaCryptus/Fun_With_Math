import hex from './hex.js';
import square from './square.js';
import triangle from './triangle.js';
import truncSquare from './truncSquare.js';
import triHex from './triHex.js';

export const tilingList = [hex, square, truncSquare, triHex, triangle];
export const tilings = Object.fromEntries(tilingList.map(t => [t.id, t]));
export const tilingIds = tilingList.map(t => t.id);