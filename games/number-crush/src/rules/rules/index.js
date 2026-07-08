// Central registry of available rules.
//
// Each entry is a factory that, given a target/param, returns a rule
// object: { id, description, validate(tiles) -> boolean }.

import { sumEquals } from './sumEquals.js';
import { productEquals } from './productEquals.js';
import { differenceEquals } from './differenceEquals.js';
import { multipleOf } from './multipleOf.js';
import { allSame } from './allSame.js';
import { ascending } from './ascending.js';

// Metadata drives the config menu. `usesTarget` indicates whether the
// rule needs a numeric target parameter.
export const RULE_REGISTRY = {
  sumEquals: {
    label: 'Sum equals target',
    factory: sumEquals,
    usesTarget: true,
    defaultTarget: 10,
  },
  productEquals: {
    label: 'Product equals target',
    factory: productEquals,
    usesTarget: true,
    defaultTarget: 12,
  },
  differenceEquals: {
    label: 'Difference equals target (exactly 2 tiles)',
    factory: differenceEquals,
    usesTarget: true,
    defaultTarget: 3,
  },
  multipleOf: {
    label: 'Sum is a multiple of target',
    factory: multipleOf,
    usesTarget: true,
    defaultTarget: 5,
  },
  allSame: {
    label: 'All tiles share the same value',
    factory: () => allSame(),
    usesTarget: false,
  },
  ascending: {
    label: 'Values strictly ascending',
    factory: () => ascending(),
    usesTarget: false,
  },
};

export function makeRule(id, target) {
  const entry = RULE_REGISTRY[id] || RULE_REGISTRY.sumEquals;
  return entry.usesTarget ? entry.factory(target) : entry.factory();
}
