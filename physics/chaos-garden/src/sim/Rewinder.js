/** Reversibility probe (§6.6): forward N, negate u with 1/Re→0, advance N, compare to S₀. */
function negate(s) {
  for (let n = 0; n < s.grid.N; n++) { s.u[n] = -s.u[n]; s.v[n] = -s.v[n]; s.w[n] = -s.w[n]; }
  s.scaleVelocity?.(-1); // async backend: mirror the sign flip on the device
}
/** Async backends hand back a promise from sync(); yield it so the pump waits for the readback. The CPU solver returns null (no yield). */
function* settle(s) { const p = s.sync(); if (p) yield p; }
export function relDiff(solver, snap) {
  let num = 0, den = 0;
  for (let n = 0; n < solver.grid.N; n++) { if (solver.solid[n]) continue; const du = solver.u[n] - snap.u[n], dv = solver.v[n] - snap.v[n], dw = solver.w[n] - snap.w[n]; num += du * du + dv * dv + dw * dw; den += snap.u[n] ** 2 + snap.v[n] ** 2 + snap.w[n] ** 2; }
  return den > 0 ? Math.sqrt(num / den) : 0;
}
export function* rewindProbe(solver, N = 200) {
  yield* settle(solver);
  const snap = solver.snapshot();
  for (let n = 0; n < N; n++) { solver.step(); if (n % 8 === 0) { yield { phase: 'forward', progress: n / (2 * N) }; yield* settle(solver); } }
  yield* settle(solver);
  negate(solver); const visc = solver.viscous; solver.reverse = true; solver.viscous = false;
  for (let n = 0; n < N; n++) { solver.step(); if (n % 8 === 0) { yield { phase: 'reverse', progress: 0.5 + n / (2 * N) }; yield* settle(solver); } }
  yield* settle(solver);
  negate(solver); solver.reverse = false; solver.viscous = visc;
  const D_rev = relDiff(solver, snap);
  solver.restore(snap);
  return { D_rev, N, horizonTime: N * solver.dt, flowThroughs: N * solver.dt / (solver.grid.Lx / solver.U0) };
}
export function runRewind(solver, N) { const g = rewindProbe(solver, N); let r; do r = g.next(); while (!r.done); return r.value; }