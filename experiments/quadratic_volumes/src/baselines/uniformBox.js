// The no-model reference: log2(mu(D)/v_eps) bits per point.

import { baselineBits } from '../core/codelength.js';

export function uniformBaseline({ muD = 1, vEps }) {
  return { bitsPerPoint: baselineBits(muD, vEps), modelBitsPerTrainPoint: 0 };
}