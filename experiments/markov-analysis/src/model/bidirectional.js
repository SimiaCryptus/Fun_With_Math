// bidirectional.js — wraps forward + backward Markov models

import { MarkovModel } from './markovModel.js';

export class BidirectionalModel {
  constructor(order) {
    this.order = order;
    this.forward = new MarkovModel(order);
    this.backward = new MarkovModel(order);
    this.tokens = [];
  }

  build(tokenStrings, onProgress) {
    this.tokens = tokenStrings;
    this.forward.build(tokenStrings, (p) => onProgress && onProgress(p * 0.5));
    const reversed = tokenStrings.slice().reverse();
    this.backward.build(reversed, (p) => onProgress && onProgress(0.5 + p * 0.5));
  }

  // Left context for position i (forward).
  leftContext(tokens, i) {
    return tokens.slice(Math.max(0, i - this.order), i);
  }

  // Right context for position i (backward, most-recent-last in reversed dir).
  rightContext(tokens, i) {
    // tokens to the right, closest first in reversed order
    const right = tokens.slice(i + 1, i + 1 + this.order).reverse();
    return right;
  }
}
