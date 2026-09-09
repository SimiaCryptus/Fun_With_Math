// Ephemeris tables.
//  - kind 'jpl': JPL "Approximate Positions of the Major Planets" elements +
//    per-century rates. el = [a(AU), e, I(deg), L(deg), varpi(deg), Om(deg)]
//    Valid 1800-2050; the campaign starts 2035 to stay inside the fit.
//  - kind 'fixed': osculating elements at a stated epoch (days since J2000).
//    el = { a, e, i, Om, w, M0 }  angles in degrees.
//
// mu   : gravitational parameter of the body itself (m^3/s^2), for
//        escape/capture Δv at parking orbits.
// atmo : aerocapture is possible here (needs an aeroshell).

export const SUN = {
  id: 'sun', name: 'Sol', mu: 1.32712440018e20, radius: 6.957e8, color: 0xffd27f,
};

export const BODIES = [
  {
    id: 'mercury', name: 'Mercury', kind: 'jpl', color: 0xa88b78,
    radius: 2.4397e6, mu: 2.2032e13, atmo: false,
    el:   [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  {
    id: 'venus', name: 'Venus', kind: 'jpl', color: 0xe6cfa0,
    radius: 6.0518e6, mu: 3.24859e14, atmo: true,
    el:   [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  },
  {
    id: 'earth', name: 'Earth', kind: 'jpl', color: 0x4f9dff,
    radius: 6.3710e6, mu: 3.986004418e14, atmo: true,
    el:   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  {
    id: 'mars', name: 'Mars', kind: 'jpl', color: 0xd9613a,
    radius: 3.3895e6, mu: 4.282837e13, atmo: true,
    el:   [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'jpl', color: 0xd8a878,
    radius: 6.9911e7, mu: 1.26686534e17, atmo: true,
    el:   [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  {
    id: 'saturn', name: 'Saturn', kind: 'jpl', color: 0xe3d3a0,
    radius: 5.8232e7, mu: 3.7931187e16, atmo: true,
    el:   [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'jpl', color: 0x8fd6de,
    radius: 2.5362e7, mu: 5.793939e15, atmo: true,
    el:   [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'jpl', color: 0x4f6ff0,
    radius: 2.4622e7, mu: 6.836529e15, atmo: true,
    el:   [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },

  // ---- minor bodies (approximate osculating elements at J2000) ----
  {
    id: 'ceres', name: '1 Ceres', kind: 'fixed', color: 0x9aa4ad,
    radius: 4.696e5, mu: 6.263e10, atmo: false,
    el: { a: 2.7675, e: 0.0757, i: 10.594, Om: 80.305, w: 73.597, M0: 95.989 },
  },
  {
    id: 'vesta', name: '4 Vesta', kind: 'fixed', color: 0xb9ad91,
    radius: 2.626e5, mu: 1.729e10, atmo: false,
    el: { a: 2.3617, e: 0.0889, i: 7.140, Om: 103.810, w: 151.198, M0: 307.803 },
  },
  {
    id: 'psyche', name: '16 Psyche', kind: 'fixed', color: 0xc9a06a,
    radius: 1.13e5, mu: 1.53e9, atmo: false,
    el: { a: 2.9229, e: 0.1400, i: 3.098, Om: 150.191, w: 229.401, M0: 30.120 },
  },
  {
    id: 'eros', name: '433 Eros', kind: 'fixed', color: 0xa08b6f,
    radius: 8.42e3, mu: 4.463e5, atmo: false,
    el: { a: 1.4583, e: 0.2226, i: 10.829, Om: 304.320, w: 178.817, M0: 320.215 },
  },
  {
    id: 'bennu', name: '101955 Bennu', kind: 'fixed', color: 0x6f6a63,
    radius: 2.45e2, mu: 4.9, atmo: false,
    el: { a: 1.1264, e: 0.2037, i: 6.035, Om: 2.061, w: 66.223, M0: 101.704 },
  },
];

export const BODY_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b]));
/**
* Comms/market rings used by the Uplink track: a tier-N uplink sees every
* station whose body sits in ring <= N. 1 = inner system, 2 = belt, 3 = outer.
*/
export const RING_BY_BODY = {
  mercury: 1, venus: 1, earth: 1, mars: 1, bennu: 1, eros: 1,
  ceres: 2, vesta: 2, psyche: 2,
  jupiter: 3, saturn: 3, uranus: 3, neptune: 3,
};