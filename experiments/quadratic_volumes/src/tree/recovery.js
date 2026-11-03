// Compare accepted constraints against a dataset's declared truth.
// Supported truth types: 'plane', 'sphere'. Anything else returns null.

import { walkNodes } from './node.js';

const norm = (v) => Math.hypot(...v);

function planeMatch(node, truth) {
  const f = node.constraint.field;
  if (!f || !f.a || f.H) return null;            // affine fields only
  const a = Array.from(f.a);
  const n = truth.normal;
  const cos = Math.abs(
    a.reduce((s, ai, i) => s + ai * n[i], 0) / (norm(a) * norm(n) || 1)
  );
  const angle = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
  const width = node.constraint.kind === 'slabIn'
    ? (node.constraint.t2 - node.constraint.t) / (norm(a) || 1)
    : null;
  return { angleDeg: angle, width, label: node.label, family: node.family };
}

function sphereMatch(node, truth) {
  const f = node.constraint.field;
  if (!f || !f.H) return null;                   // quadratic fields only
  const H = f.H;
  const lam = (H[0][0] + H[1][1] + H[2][2]) / 6; // ~ coefficient of |x|²
  if (!(lam > 1e-9)) return null;
  const iso = Math.max(
    Math.abs(H[0][0] - H[1][1]), Math.abs(H[1][1] - H[2][2]),
    Math.abs(H[0][1]), Math.abs(H[0][2]), Math.abs(H[1][2])
  ) / (2 * lam);
  if (iso > 0.35) return null;                   // not close to a sphere
  const c = [0, 1, 2].map((k) => -f.a[k] / (2 * lam));
  const v0 = f.eval(Float64Array.from(c));
  const t = node.constraint.kind === 'slabIn'
    ? 0.5 * (node.constraint.t + node.constraint.t2)
    : node.constraint.t;
  const r2 = (t - v0) / lam;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  const dc = Math.hypot(
    c[0] - truth.center[0], c[1] - truth.center[1], c[2] - truth.center[2]
  );
  return {
    centerError: dc,
    radius: r,
    radiusError: Math.abs(r - truth.radius),
    label: node.label,
    family: node.family,
  };
}

export function recover(tree, truth) {
  if (!truth || !truth.type) return null;
  const out = [];
  for (const node of walkNodes(tree)) {
    if (!node.constraint || node.constraint.kind === 'contract') continue;
    const m = truth.type === 'plane'
      ? planeMatch(node, truth)
      : truth.type === 'sphere' ? sphereMatch(node, truth) : null;
    if (m) out.push({ ...m, depth: node.depth, gain: node.gain.lo });
  }
  if (!out.length) return { type: truth.type, matched: false };
  if (truth.type === 'plane') out.sort((a, b) => a.angleDeg - b.angleDeg);
  else out.sort((a, b) => a.radiusError - b.radiusError);
  return { type: truth.type, matched: true, best: out[0], all: out.slice(0, 5), truth };
}