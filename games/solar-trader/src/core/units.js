// Canonical heliocentric units: length = 1 AU, time = 1 TU so that mu_sun == 1.

export const AU      = 1.495978707e11;      // m
export const MU_SUN  = 1.32712440018e20;    // m^3 s^-2
export const G0      = 9.80665;             // m s^-2
export const DAY     = 86400;               // s

export const TU      = Math.sqrt((AU * AU * AU) / MU_SUN); // s  (~5.0226e6)
export const VU      = AU / TU;                            // m/s (~29784.7)
export const DAYS_PER_TU = TU / DAY;                       // ~58.132

export const daysToTU = (d) => d / DAYS_PER_TU;
export const tuToDays = (t) => t * DAYS_PER_TU;

/** canonical speed -> km/s */
export const vuToKms = (v) => (v * VU) / 1000;
/** km/s -> canonical speed */
export const kmsToVU = (v) => (v * 1000) / VU;

export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/** days since J2000 -> JS Date */
export function dateFromDays(d) {
  return new Date(J2000_MS + d * DAY * 1000);
}
/** JS Date / epoch-ms -> days since J2000 */
export function daysFromDate(date) {
  const ms = date instanceof Date ? date.getTime() : date;
  return (ms - J2000_MS) / (DAY * 1000);
}
/** YYYY-MM-DD */
export function fmtDate(days) {
  return dateFromDays(days).toISOString().slice(0, 10);
}
/** e.g. "1y 214d" */
export function fmtDuration(days) {
  const d = Math.max(0, Math.round(days));
  if (d < 365) return `${d}d`;
  return `${Math.floor(d / 365)}y ${d % 365}d`;
}

export const DEG = Math.PI / 180;
export const TWO_PI = Math.PI * 2;

export function wrapAngle(a) {           // -> [-pi, pi)
  let x = (a + Math.PI) % TWO_PI;
  if (x < 0) x += TWO_PI;
  return x - Math.PI;
}

export function fmtNum(n, dp = 0) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtCredits(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}G¢`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M¢`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k¢`;
  return `${Math.round(n)}¢`;
}
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);