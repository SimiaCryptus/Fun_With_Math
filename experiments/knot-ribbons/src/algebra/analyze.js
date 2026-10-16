// Pure function State → derived algebra. Used by the worker and as sync fallback.
import { parseWord, delta, pow, freeReduce, formatWord } from './braid.js';
import { permOfWord, cycles, formatCycles, isIdentity, cycleType, sign } from './perm.js';
import { normalForm, formatNF } from './garside.js';
import { parseCuts } from './wreath.js';

export function analyze(st) {
  try {
    const n = st.n | 0;
    if (n < 1 || n > 12) throw new Error('n must be between 1 and 12');
    const m = st.m | 0;
    const intWord = parseWord(st.word || '', n);
    const totalWord = [...intWord, ...pow(delta(n), m)];
    const tau = permOfWord(totalWord, n);
    const cyc = cycles(tau);
    const compOf = [];
    cyc.forEach((c, ci) => c.forEach((s) => { compOf[s] = ci; }));
    const nf = normalForm(totalWord, n);
    const reduced = freeReduce(totalWord);
    return {
      n, m, intWord, totalWord,
      totalStr: formatWord(totalWord),
      reducedLength: reduced.length,
      tau, cycles: cyc, compOf, k: cyc.length,
      tauStr: formatCycles(cyc),
      cycleType: cycleType(cyc),
      sign: sign(tau),
      pure: isIdentity(tau),
      intPure: isIdentity(permOfWord(intWord, n)),
      orientable: m % 2 === 0,
      nf, nfStr: formatNF(nf),
      cuts: parseCuts(st.cuts || ''),
    };
  } catch (e) {
    return { error: e.message };
  }
}