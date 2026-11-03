// Field (de)serialization, so fields can cross the worker boundary.

import { AffineField } from './affine.js';
import { QuadraticField } from './quadratic.js';

export function fieldToJSON(f) {
  return f && f.toJSON ? f.toJSON() : null;
}

export function fieldFromJSON(j) {
  if (!j) return null;
  if (j.type === 'affine') return new AffineField(j.a, j.c, j.meta || {});
  if (j.type === 'quadratic')
    return new QuadraticField(j.Q, j.a, j.c, j.meta || {});
  throw new Error('unknown field type ' + j.type);
}