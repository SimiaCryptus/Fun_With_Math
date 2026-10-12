/**
 * Presets (reference values: IAU 2015 nominal solar radius, DE440-era GM values, 1 AU = 149 597 870.7 km).
 * μ = m₂/(m₁+m₂); L = separation of the primaries [km];
 * R1 / R2 = physical radii of the primary / secondary [km];
 * GM = G(m₁+m₂) [km³/s²] — together with L it fixes the time unit √(L³/GM) and the velocity unit L·n.
 * Rbody (normalized secondary radius) is kept for backward compatibility.
 */
export const SYSTEMS = {
    earthMoon: {
        name: 'Earth–Moon', mu: 1.215058e-2, L: 384400, R1: 6371.0, R2: 1737.4,
        GM: 403503.24, Rbody: 1737.4 / 384400,
    },
    sunJupiter: {
        name: 'Sun–Jupiter', mu: 9.53688e-4, L: 778.479e6, R1: 695700, R2: 71492,
        GM: 1.32839126552e11, Rbody: 71492 / 778.479e6,
    },
    sunEarth: {
        name: 'Sun–Earth', mu: 3.003489e-6, L: 1.495978707e8, R1: 695700, R2: 6371.0,
        GM: 1.327128386184e11, Rbody: 6371.0 / 1.495978707e8,
    },
};