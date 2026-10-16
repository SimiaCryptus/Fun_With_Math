// Garside left normal form Δ^p A_1 … A_r via permutation braids (El-Rifai–Morton).
// A simple element is stored as its permutation (perm.js convention).
import { identity, inverse, isIdentity } from './perm.js';
import { delta, pow, formatWord } from './braid.js';

export const deltaPerm = (n) => identity(n).map((i) => n - 1 - i);
export const flipPerm = (A, n) => A.map((_, p) => n - 1 - A[n - 1 - p]);
const swapFn = (i) => (q) => (q === i ? i + 1 : q === i + 1 ? i : q);

function inversions(A) {
  let c = 0;
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (A[i] > A[j]) c++;
  return c;
}

/** S(B): generators σ_{i+1} that left-divide B. */
export function startSet(B) {
  const s = [];
  for (let i = 0; i + 1 < B.length; i++) if (B[i] > B[i + 1]) s.push(i);
  return s;
}

/** F(A): generators σ_{i+1} that right-divide A. */
export function finishSet(A) {
  const Ai = inverse(A);
  const s = [];
  for (let i = 0; i + 1 < A.length; i++) if (Ai[i] > Ai[i + 1]) s.push(i);
  return s;
}

export function normalForm(word, n) {
  const d = deltaPerm(n);
  const full = (n * (n - 1)) / 2;
  let p = 0;
  let F = [];
  for (const g of word) {
    const s = swapFn(Math.abs(g) - 1);
    if (g > 0) {
      F.push(identity(n).map(s));
    } else {
      // σ_i⁻¹ = Δ⁻¹ · (Δσ_i⁻¹); push Δ⁻¹ left through the prefix (flip each factor).
      F = F.map((A) => flipPerm(A, n));
      p--;
      F.push(d.map(s));
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let j = 0; j + 1 < F.length; j++) {
      let A = F[j];
      let B = F[j + 1];
      for (;;) {
        const Ai = inverse(A);
        let mv = -1;
        for (let i = 0; i + 1 < n; i++) {
          if (B[i] > B[i + 1] && Ai[i] < Ai[i + 1]) { mv = i; break; }
        }
        if (mv < 0) break;
        const s = swapFn(mv);
        A = A.map(s); // A·σ
        const Bc = B;
        B = Bc.map((_, q) => Bc[s(q)]); // σ⁻¹·B
        changed = true;
      }
      F[j] = A;
      F[j + 1] = B;
    }
    const before = F.length;
    F = F.filter((A) => !isIdentity(A));
    while (F.length && full > 0 && inversions(F[0]) === full) {
      F.shift();
      p++;
    }
    if (F.length !== before) changed = true;
  }
  return { p, factors: F };
}

/** Positive word of a simple element. */
export function simpleToWord(P) {
  let Q = P.slice();
  const w = [];
  while (!isIdentity(Q)) {
    let i = 0;
    while (!(Q[i] > Q[i + 1])) i++;
    w.push(i + 1);
    const s = swapFn(i);
    const Qc = Q;
    Q = Qc.map((_, q) => Qc[s(q)]);
  }
  return w;
}

export const nfToWord = (nf, n) => [...pow(delta(n), nf.p), ...nf.factors.flatMap(simpleToWord)];

export function formatNF(nf) {
  const parts = [`Δ${nf.p === 1 ? '' : '^' + nf.p}`];
  for (const A of nf.factors) parts.push(`[${formatWord(simpleToWord(A))}]`);
  return parts.join(' · ');
}