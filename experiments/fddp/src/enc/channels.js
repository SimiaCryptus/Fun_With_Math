// §9.1 channel construction. §9.2 explains why the delta-offset log is
// mandatory: it is finite at A=0, monotone, bounded-derivative near zero, and
// therefore keeps the Jacobian of the whole pipeline bounded (§17.2).
export function signedLogMag(x, delta) {
  const l = Math.log(Math.abs(x) + delta) - Math.log(delta);
  return x < 0 ? -l : l;
}

export function invSignedLogMag(v, delta) {
  const a = delta * (Math.exp(Math.abs(v)) - 1);   // |X| = delta*(e^|v| - 1)
  return v < 0 ? -a : a;
}

export function logMag(a, delta) {
  return Math.log(a + delta) - Math.log(delta);
}

export function invLogMag(v, delta) {
  return delta * (Math.exp(v) - 1);
}

// §9.1 — princ() wraps to (-pi, pi]. Used by IF/GD; kept here so the phase
// conformance vector has a single implementation to target.
export function princ(theta) {
  let t = theta % (2 * Math.PI);
  if (t <= -Math.PI) t += 2 * Math.PI;
  else if (t > Math.PI) t -= 2 * Math.PI;
  return t;
}