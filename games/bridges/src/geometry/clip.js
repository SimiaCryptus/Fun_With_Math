import { sub, cross } from './Vec2.js';

function intersect(p, q, a, b) {
  const d1 = cross(sub(b, a), sub(p, a));
  const d2 = cross(sub(b, a), sub(q, a));
  const t = d1 / (d1 - d2);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

/** Sutherland–Hodgman: clip `subject` against a convex CCW `clip` polygon. */
export function clipPolygon(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = p => cross(sub(b, a), sub(p, a)) >= -1e-9;
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j], prev = inp[(j + inp.length - 1) % inp.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) {
        if (!pi) out.push(intersect(prev, cur, a, b));
        out.push(cur);
      } else if (pi) {
        out.push(intersect(prev, cur, a, b));
      }
    }
  }
  return out;
}