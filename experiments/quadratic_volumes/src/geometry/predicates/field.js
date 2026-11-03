// Common interface for scalar fields used as split generators.
//
//   eval(x)        -> number
//   range(box)     -> { lo, hi }   certified enclosure of f over the box
//   text()         -> human-readable symbolic form
//   paramCount     -> number of real parameters (for MDL pricing)
//
// Any object satisfying this shape can be fed to the oracle and the tree.

export function checkField(f) {
  return (
    typeof f.eval === 'function' &&
    typeof f.range === 'function' &&
    typeof f.paramCount === 'number'
  );
}

/** Verify an enclosure against samples. Used by the test suite. */
export function enclosureViolations(field, box, samples, rng) {
  const r = field.range(box);
  const d = box.lo.length;
  let bad = 0;
  const x = new Float64Array(d);
  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < d; i++) x[i] = box.lo[i] + (box.hi[i] - box.lo[i]) * rng.uniform();
    const v = field.eval(x);
    if (v < r.lo - 1e-9 || v > r.hi + 1e-9) bad++;
  }
  return bad;
}