// Samples {p, W, O} → non-indexed triangles ordered by arc length (for drawRange knife).
// th > 0 gives a thin slab (top, bottom, two sides) for proper shading; `per` = vertices per segment.
export function stripArrays(samples, hw, th = 0) {
  const segs = samples.length - 1;
  const h = th / 2;
  // [corner0, corner1, normal key, normal sign]; corner = [side, lift]
  const faces = th > 0
    ? [
      [[-1, h], [1, h], 'O', 1],
      [[1, -h], [-1, -h], 'O', -1],
      [[1, h], [1, -h], 'W', 1],
      [[-1, -h], [-1, h], 'W', -1],
    ]
    : [[[-1, 0], [1, 0], 'O', 1]];
  const per = faces.length * 6;
  const position = new Float32Array(segs * per * 3);
  const normal = new Float32Array(segs * per * 3);
  let o = 0;
  const put = (s, [side, lift], nk, ns) => {
    for (let d = 0; d < 3; d++) {
      position[o + d] = s.p[d] + side * hw * s.W[d] + lift * s.O[d];
      normal[o + d] = ns * s[nk][d];
    }
    o += 3;
  };
  for (let k = 0; k < segs; k++) {
    const a = samples[k], b = samples[k + 1];
    for (const [c0, c1, nk, ns] of faces) {
      put(a, c0, nk, ns); put(a, c1, nk, ns); put(b, c1, nk, ns);
      put(a, c0, nk, ns); put(b, c1, nk, ns); put(b, c0, nk, ns);
    }
  }
  return { position, normal, segs, per };
}