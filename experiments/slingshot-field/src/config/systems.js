/**
 * Presets. μ = m₂/(m₁+m₂); L = separation of the primaries [km];
 * R1 / R2 = physical radii of the primary / secondary [km].
 * Rbody (normalized secondary radius) is kept for backward compatibility.
 */
export const SYSTEMS = {
    earthMoon: {name: 'Earth–Moon', mu: 1.215058e-2, L: 384400, R1: 6371, R2: 1737.4, Rbody: 1737.4 / 384400},
    sunJupiter: {name: 'Sun–Jupiter', mu: 9.5388e-4, L: 778.5e6, R1: 696000, R2: 71492, Rbody: 71492 / 778.5e6},
    sunEarth: {name: 'Sun–Earth', mu: 3.0035e-6, L: 1.496e8, R1: 696000, R2: 6371, Rbody: 6371 / 1.496e8},
};