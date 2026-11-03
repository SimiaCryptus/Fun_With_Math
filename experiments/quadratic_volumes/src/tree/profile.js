// Codimension and scale profile (idea.md §7.4): along each root-to-leaf
// path, cumulative -Δlog2 μ against cumulative C_split.

import { log2 } from '../core/special.js';

const mid = (iv) => (iv ? 0.5 * (iv.lo + iv.hi) : null);

export function profile(tree, { vEps = Math.pow(2, -30) } = {}) {
  const paths = [];
  const floor = (v) => Math.max(v, vEps);

  const walk = (node, Vparent, steps, cumCost) => {
    if (node.type === 'leaf') {
      if (node.n === 0) return;
      paths.push({
        n: node.n,
        steps,
        totalDrop: steps.reduce((s, x) => s + x.drop, 0),
        totalCost: cumCost,
        finalLogV: log2(floor(Vparent)),
      });
      return;
    }
    const vl = mid(node.VL);
    const vr = mid(node.VR);
    const goto = (child, V, side) => {
      const Vc = V == null ? Vparent : floor(V);
      const drop = log2(floor(Vparent)) - log2(Vc);
      walk(
        child, Vc,
        steps.concat([{
          depth: node.depth, family: node.family, side,
          drop, cost: node.cost, label: node.label,
        }]),
        cumCost + node.cost
      );
    };
    goto(node.left, vl, 'L');
    goto(node.right, vr, 'R');
  };

  const V0 = tree.type === 'leaf'
    ? mid(tree.measure) ?? 1
    : (mid(tree.VL) ?? 0) + (mid(tree.VR) ?? 0) || 1;
  walk(tree, floor(V0), [], 0);

  // "collapses" = steps whose drop is large relative to their price
  for (const p of paths) {
    p.collapses = p.steps.filter((s) => s.drop > 1 && s.drop * p.n > 4 * s.cost).length;
  }
  paths.sort((a, b) => b.n - a.n);
  return paths;
}

/** Estimated codimension: median number of cheap large collapses. */
export function estimatedCodim(paths) {
  if (!paths.length) return 0;
  const c = paths.map((p) => p.collapses).sort((a, b) => a - b);
  return c[Math.floor(c.length / 2)];
}