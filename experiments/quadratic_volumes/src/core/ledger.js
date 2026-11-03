// Model-bit bookkeeping per accounting protocol (idea.md §4.3).

import {
  familyBits,
  gridBits,
  thresholdBits,
  slabBits,
  paramBits,
  TOPOLOGY_BIT,
} from './codelength.js';

/**
 * Price of one split, given the protocol.
 * @param {object} o
 *  protocol: 'conditional' | 'fullSample'
 *  numFamilies, gridSize, numThresholds, slab (bool)
 *  paramCount, n (points the parameters were fitted on)
 *  explicitParamBits (overrides paramCount pricing, e.g. pointer coding)
 */
export function splitCost(o) {
  const {
    protocol = 'fullSample',
    numFamilies = 1,
    gridSize = 1,
    numThresholds = 1,
    slab = false,
    paramCount = 0,
    n = 2,
    explicitParamBits = null,
  } = o;
  let bits = TOPOLOGY_BIT + familyBits(numFamilies) + gridBits(gridSize);
  bits += slab ? slabBits(numThresholds) : thresholdBits(numThresholds);
  if (protocol !== 'conditional') {
    bits +=
      explicitParamBits !== null ? explicitParamBits : paramBits(n, paramCount);
  }
  return bits;
}

/** Running total of model bits over a tree. */
export class Ledger {
  constructor() {
    this.modelBits = 0;
    this.entries = [];
  }
  charge(label, bits) {
    this.modelBits += bits;
    this.entries.push({ label, bits });
    return bits;
  }
}