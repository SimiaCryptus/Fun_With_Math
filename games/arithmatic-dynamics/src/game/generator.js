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

export function generateAdditive({ terms = 2, minTerm = 1, maxTerm = 30 } = {}) {
  const parts = [String(randInt(minTerm, maxTerm))];
  for (let i = 1; i < terms; i++) {
    const op = pick(['+', '-']);
    parts.push(op, String(randInt(minTerm, maxTerm)));
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

export function generateMultiplicative({ minFactor = 2, maxFactor = 9 } = {}) {
  const lo = Math.max(2, minFactor);
  const a = randInt(lo, maxFactor);
  const b = randInt(lo, maxFactor);
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

export function generateRandom({
  allowMultiply = true,
  minTerm = 1,
  maxTerm = 30,
  ops = null,
} = {}) {
  // `ops` counts operators; number of terms is ops + 1.
  const terms = ops ? ops + 1 : pick([2, 3]);
  if (!allowMultiply) {
    return generateAdditive({ terms, minTerm, maxTerm });
  }
  return Math.random() < 0.6
    ? generateAdditive({ terms, minTerm, maxTerm })
    : generateMultiplicative({ minFactor: Math.max(2, minTerm), maxFactor: Math.max(2, maxTerm) });
}
