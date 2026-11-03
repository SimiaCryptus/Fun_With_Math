// Marching tetrahedra over a uniform grid in a box. DOM-free: returns a
// flat Float32Array of triangle vertices for the level set f(x) = t.

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const TETS = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];

export function marchingTets(field, box, t, res = 24) {
  const n = res + 1;
  const lo = box.lo;
  const step = [
    (box.hi[0] - lo[0]) / res,
    (box.hi[1] - lo[1]) / res,
    (box.hi[2] - lo[2]) / res,
  ];
  const val = new Float64Array(n * n * n);
  const x = new Float64Array(3);
  const at = (i, j, k) => (i * n + j) * n + k;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        x[0] = lo[0] + i * step[0];
        x[1] = lo[1] + j * step[1];
        x[2] = lo[2] + k * step[2];
        val[at(i, j, k)] = field.eval(x) - t;
      }

  const out = [];
  const P = (c, i, j, k) => [
    lo[0] + (i + CORNERS[c][0]) * step[0],
    lo[1] + (j + CORNERS[c][1]) * step[1],
    lo[2] + (k + CORNERS[c][2]) * step[2],
  ];
  const V = (c, i, j, k) =>
    val[at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
  const mix = (pa, va, pb, vb) => {
    const s = va / (va - vb);
    return [
      pa[0] + s * (pb[0] - pa[0]),
      pa[1] + s * (pb[1] - pa[1]),
      pa[2] + s * (pb[2] - pa[2]),
    ];
  };

  for (let i = 0; i < res; i++)
    for (let j = 0; j < res; j++)
      for (let k = 0; k < res; k++) {
        for (const tet of TETS) {
          const p = [], v = [];
          for (const c of tet) { p.push(P(c, i, j, k)); v.push(V(c, i, j, k)); }
          const neg = [], pos = [];
          for (let m = 0; m < 4; m++) (v[m] < 0 ? neg : pos).push(m);
          if (neg.length === 0 || neg.length === 4) continue;
          if (neg.length === 1 || neg.length === 3) {
            const a = neg.length === 1 ? neg[0] : pos[0];
            const rest = [0, 1, 2, 3].filter((m) => m !== a);
            const tri = rest.map((m) => mix(p[a], v[a], p[m], v[m]));
            out.push(...tri[0], ...tri[1], ...tri[2]);
          } else {
            const [n0, n1] = neg;
            const [p0, p1] = pos;
            const e00 = mix(p[n0], v[n0], p[p0], v[p0]);
            const e01 = mix(p[n0], v[n0], p[p1], v[p1]);
            const e10 = mix(p[n1], v[n1], p[p0], v[p0]);
            const e11 = mix(p[n1], v[n1], p[p1], v[p1]);
            out.push(...e00, ...e01, ...e11, ...e00, ...e11, ...e10);
          }
        }
      }
  return Float32Array.from(out);
}