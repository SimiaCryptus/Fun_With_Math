/**
 * Conversion from the normalized CR3BP units (separation = 1, angular rate = 1, total mass = 1)
 * to physical units. p: {L [km], GM [km³/s²]}.
 *   time unit     t* = √(L³/GM)  [s]   (period of the primaries = 2π t*)
 *   velocity unit v* = L / t*    [km/s]
 *   energy unit   v*²            [km²/s² = MJ/kg]
 */
export function unitsOf(p) {
    const L = +p?.L, GM = +p?.GM;
    if (!(L > 0) || !(GM > 0)) return null;
    const tU = Math.sqrt((L * L * L) / GM);
    return {L, GM, tU, vU: L / tU};
}

const AU = 1.495978707e8;
const DAY = 86400, YEAR = 365.25 * DAY;

/** Normalized time → readable physical duration. */
export function fmtTime(t, U) {
    if (!U || !Number.isFinite(t)) return '';
    const s = Math.abs(t) * U.tU, sg = t < 0 ? '−' : '';
    if (s < 3600) return `${sg}${(s / 60).toPrecision(3)} min`;
    if (s < 2 * DAY) return `${sg}${(s / 3600).toPrecision(3)} h`;
    if (s < 2 * YEAR) return `${sg}${(s / DAY).toPrecision(3)} d`;
    return `${sg}${(s / YEAR).toPrecision(3)} yr`;
}

/** Normalized velocity → m/s or km/s. */
export function fmtVel(v, U) {
    if (!U || !Number.isFinite(v)) return '';
    const k = v * U.vU;
    return Math.abs(k) < 1 ? `${(k * 1000).toPrecision(3)} m/s` : `${k.toPrecision(4)} km/s`;
}

/** Normalized length → km or AU. */
export function fmtLen(r, U) {
    if (!U || !Number.isFinite(r)) return '';
    const km = r * U.L;
    return Math.abs(km) >= 1e7 ? `${(km / AU).toPrecision(4)} AU` : `${km.toPrecision(4)} km`;
}

/** Normalized specific energy → km²/s² (= MJ/kg). */
export function fmtEnergy(e, U) {
    if (!U || !Number.isFinite(e)) return '';
    return `${(e * U.vU * U.vU).toPrecision(4)} km²/s²`;
}