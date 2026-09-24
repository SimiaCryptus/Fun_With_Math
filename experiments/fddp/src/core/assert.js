// Dev-mode invariants. Off by default; enabled by ?dev in the browser or
// FDDP_DEV=1 in node. These localise a failure; the conformance tests prove it.
export const DEV = (() => {
  try {
    if (typeof location !== 'undefined') return new URLSearchParams(location.search).has('dev');
    if (typeof process !== 'undefined') return process.env.FDDP_DEV === '1';
  } catch { /* capability probe only */ }
  return false;
})();

export function devAssert(cond, msg) {
  if (DEV && !cond) throw new Error('INVARIANT: ' + msg);
}