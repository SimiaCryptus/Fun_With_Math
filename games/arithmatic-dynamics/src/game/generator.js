// Random problem generator.
//
// Produces a level-like spec whose `start` string evaluates to a tidy
// target and is solvable with the given verb set. Two flavours:
//   additive       -> a ± b (± c)
//   multiplicative -> a × b, or (a × b) ÷ b style cancels

import { defineLevel, Stars } from './level.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateAdditive({ terms = 2, maxTerm = 30 } = {}) {
  const parts = [String(randInt(1, maxTerm))];
  for (let i = 1; i < terms; i++) {
    const op = pick(['+', '-']);
    parts.push(op, String(randInt(1, maxTerm)));
  }
  const start = parts.join(' ');
  return defineLevel({
    id: `rand-add-${Date.now()}`,
    start,
    allowedVerbs: ['split', 'swap', 'group', 'ungroup', 'combine', 'cancel'],
    allowedOps: ['+', '-'],
    stars: [Stars.solve(), Stars.fewMoves(terms)],
    hint: 'Combine adjacent numbers to simplify.',
  });
}

export function generateMultiplicative({ maxFactor = 9 } = {}) {
  const a = randInt(2, maxFactor);
  const b = randInt(2, maxFactor);
  // 50/50: plain product, or product-then-divide cancel.
  let start;
  if (Math.random() < 0.5) {
    start = `${a} * ${b}`;
  } else {
    start = `(${a} * ${b}) / ${b}`;
  }
  return defineLevel({
    id: `rand-mul-${Date.now()}`,
    start,
    allowedVerbs: ['split', 'factorize', 'swap', 'group', 'ungroup', 'combine', 'cancel'],
    allowedOps: ['*', '/'],
    stars: [Stars.solve()],
    hint: 'Cancel matching factors, then combine.',
  });
}

export function generateRandom({ allowMultiply = true } = {}) {
  if (!allowMultiply) {
    return generateAdditive({ terms: pick([2, 3]) });
  }
  return Math.random() < 0.6 ? generateAdditive({ terms: pick([2, 3]) }) : generateMultiplicative();
}
