// Braid word → strand samples on the ribbon ("switched foliation": smoothstep swaps + ±h normal offset).
import { coreCurve, bishopFrames, add, scale, sub, cross, dot, normalize } from './frames.js';
import { subHalfWidth, transverse } from './foliate.js';

const smooth = (u) => u * u * (3 - 2 * u);

export function strandPaths(word, n, m, opt = {}) {
  const R = opt.R ?? 3;
  const width = opt.width ?? 1.6;
   // Over/under separation must be comparable to the strip width or crossings read as overlaps.
   const h = opt.h ?? Math.max(0.1, 0.9 * subHalfWidth(width, n));
  const L = word.length;
  const slots = L + 1;
  const N = opt.N ?? Math.min(4000, Math.max(256, 48 * slots));
  const P = coreCurve(N, R);
  const { Nn, B } = bishopFrames(P);
  const xOf = (q) => transverse(q, n, width);

  const posStart = [];
  const pos = [...Array(n).keys()];
  const at = [...Array(n).keys()];
  for (let j = 0; j < slots; j++) {
    posStart.push(pos.slice());
    if (j < L) {
      const i = Math.abs(word[j]) - 1;
      const a = at[i], b = at[i + 1];
      at[i] = b; at[i + 1] = a; pos[a] = i + 1; pos[b] = i;
    }
  }

  const frames = [];
  for (let k = 0; k <= N; k++) {
    const th = (Math.PI * m * k) / N, c = Math.cos(th), s = Math.sin(th), kk = k % N;
    frames.push({
      p: P[kk],
      W: add(scale(Nn[kk], c), scale(B[kk], s)),
      O: add(scale(Nn[kk], -s), scale(B[kk], c)),
    });
  }

  const strands = [];
  for (let st = 0; st < n; st++) {
     const raw = [];
    for (let k = 0; k <= N; k++) {
      const sN = k / N;
      const j = Math.min(Math.floor(sN * slots), slots - 1);
      const u = sN * slots - j;
      const q = posStart[j][st];
      let x = xOf(q), o = 0;
      if (j < L) {
        const g = word[j], i = Math.abs(g) - 1, sg = g > 0 ? 1 : -1;
        const bump = h * Math.sin(Math.PI * u), t = smooth(u);
        if (q === i) { x = xOf(i) + (xOf(i + 1) - xOf(i)) * t; o = sg * bump; }
        else if (q === i + 1) { x = xOf(i + 1) + (xOf(i) - xOf(i + 1)) * t; o = -sg * bump; }
      }
      const f = frames[k];
       raw.push({ p: add(f.p, add(scale(f.W, x), scale(f.O, o))), W: f.W, O: f.O });
    }
     // Re-orthogonalise the frame to the strand's own tangent so strips don't shear at crossings.
     const S = raw.map((r, k) => {
       const Ts = normalize(sub(raw[Math.min(N, k + 1)].p, raw[Math.max(0, k - 1)].p));
       const W = normalize(cross(r.O, Ts));
       if (dot(W, r.W) < 0.2) return r; // degenerate guard
       return { p: r.p, W, O: cross(Ts, W) };
     });
     strands.push(S);
  }

  const crossings = word.map((g, j) => {
    const f = frames[Math.round(((j + 0.5) / slots) * N)];
    const i = Math.abs(g) - 1;
    return add(f.p, scale(f.W, (xOf(i) + xOf(i + 1)) / 2));
  });

  return {
    N, n, m, width, crossings, strands,
    core: frames,
    hwCore: width / 2,
    hwStrand: subHalfWidth(width, n),
     th: Math.min(0.05, subHalfWidth(width, n) * 0.3),
  };
}