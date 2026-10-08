// Runtime knobs. The physical field comes from the tabulated solver (see table.js);
// these only shape the gap design term and the far-field blend.
export default Object.freeze({
  // Width of the gap-term fade at the gap's radial/axial edges, relative to radius.
  gapPadRel: 0.25,
  // Gap-term strength fades out between these h/R values (plan R7).
  gapFadeLo: 3,
  gapFadeHi: 8,
  // Coaxiality gate for the gap term (cos of angle between normal and pair axis).
  coaxLo: 0.95,
  coaxHi: 0.995,
  // Step for ∇(gap weight) (metres).
  fdStep: 1e-5,
  // Exact panel sum → multipole blend, in units of the pair's source extent.
  farLo: 3,
  farHi: 4,
});