/** Presets: μ and physical secondary radius in normalized length units. */
export const SYSTEMS = {
  earthMoon:   { name: 'Earth–Moon',  mu: 1.215058e-2, Rbody: 1737.4 / 384400, L: 384400 },
  sunJupiter:  { name: 'Sun–Jupiter', mu: 9.5388e-4,   Rbody: 71492 / 778.5e6, L: 778.5e6 },
  sunEarth:    { name: 'Sun–Earth',   mu: 3.0035e-6,   Rbody: 6371 / 1.496e8,  L: 1.496e8 },
};