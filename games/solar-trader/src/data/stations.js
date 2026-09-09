// A station is a circular parking orbit of radius rPark (metres) around its
// parent body. rPark drives departure/capture Δv — high orbits are cheap to
// leave, low orbits are where the industry is.
//
// econ: per-commodity { p: production t/day, c: consumption t/day, m: local
//       price multiplier }.  Stock equilibrium is derived in economy.js.

export const STATIONS = [
  {
    id: 'caloris', name: 'Caloris Smelters', body: 'mercury', rPark: 2.90e6,
    tech: 2, spread: 0.07, mining: null,
    econ: {
      ree: { p: 5, c: 0, m: 0.55 }, iron: { p: 40, c: 0, m: 0.6 },
      silicates: { p: 30, c: 0, m: 0.5 },
      water: { p: 0, c: 8, m: 2.4 }, food: { p: 0, c: 3, m: 2.2 },
      o2: { p: 0, c: 6, m: 2.0 }, machinery: { p: 0, c: 1.2, m: 1.6 },
      h2: { p: 0, c: 4, m: 2.6 },
    },
  },
  {
    id: 'aphrodite', name: 'Aphrodite Cloudworks', body: 'venus', rPark: 6.30e6,
    tech: 3, spread: 0.05, mining: null,
    econ: {
      d2: { p: 1.2, c: 0, m: 0.6 }, polymers: { p: 9, c: 0, m: 0.65 },
      o2: { p: 12, c: 0, m: 0.8 },
      food: { p: 0, c: 4, m: 1.9 }, machinery: { p: 0, c: 1.5, m: 1.5 },
      water: { p: 0, c: 6, m: 1.7 }, electronics: { p: 0, c: 0.5, m: 1.5 },
    },
  },
  {
    id: 'leo-gateway', name: 'LEO Gateway', body: 'earth', rPark: 6.80e6,
    tech: 5, spread: 0.03, mining: null, home: true,
    econ: {
      electronics: { p: 3, c: 0, m: 0.55 }, machinery: { p: 12, c: 0, m: 0.6 },
      meds: { p: 1.4, c: 0, m: 0.6 }, food: { p: 20, c: 0, m: 0.7 },
      pgm: { p: 0, c: 1.6, m: 1.85 }, ree: { p: 0, c: 3.5, m: 1.7 },
      he3: { p: 0, c: 0.05, m: 2.1 }, iron: { p: 0, c: 25, m: 1.35 },
      ice: { p: 0, c: 20, m: 1.6 }, d2: { p: 0, c: 1.5, m: 1.6 },
      h2: { p: 4, c: 0, m: 1.2 },
    },
  },
  {
    id: 'shackleton', name: 'Luna Shackleton', body: 'earth', rPark: 3.844e8,
    tech: 4, spread: 0.04, mining: { yield: 9, goods: ['ice', 'silicates'] },
    econ: {
      ice: { p: 30, c: 0, m: 0.5 }, o2: { p: 18, c: 0, m: 0.7 },
      silicates: { p: 40, c: 0, m: 0.45 }, h2: { p: 6, c: 0, m: 0.9 },
      food: { p: 0, c: 5, m: 1.7 }, machinery: { p: 0, c: 2, m: 1.4 },
      polymers: { p: 0, c: 1.5, m: 1.5 }, electronics: { p: 0, c: 0.4, m: 1.4 },
    },
  },
  {
    id: 'tharsis', name: 'Tharsis Terminal', body: 'mars', rPark: 3.99e6,
    tech: 4, spread: 0.05, mining: null,
    econ: {
      food: { p: 8, c: 0, m: 0.75 }, ch4: { p: 22, c: 0, m: 0.55 },
      water: { p: 14, c: 0, m: 0.7 }, polymers: { p: 4, c: 0, m: 0.9 },
      electronics: { p: 0, c: 0.7, m: 1.7 }, machinery: { p: 0, c: 2.5, m: 1.45 },
      pgm: { p: 0, c: 0.8, m: 1.7 }, meds: { p: 0, c: 0.3, m: 1.8 },
    },
  },
  {
    id: 'deimos', name: 'Deimos Yard', body: 'mars', rPark: 2.346e7,
    tech: 4, spread: 0.05, mining: { yield: 6, goods: ['silicates', 'iron'] },
    econ: {
      machinery: { p: 5, c: 0, m: 0.85 }, iron: { p: 15, c: 0, m: 0.8 },
      silicates: { p: 20, c: 0, m: 0.5 },
      h2: { p: 0, c: 5, m: 1.8 }, food: { p: 0, c: 3, m: 1.8 },
      water: { p: 0, c: 5, m: 1.4 }, ree: { p: 0, c: 1.0, m: 1.5 },
    },
  },
  {
    id: 'bennu-claim', name: 'Bennu Claim', body: 'bennu', rPark: 1.2e3,
    tech: 1, spread: 0.09, mining: { yield: 12, goods: ['ice', 'polymers'] },
    econ: {
      ice: { p: 16, c: 0, m: 0.4 }, polymers: { p: 3, c: 0, m: 0.7 },
      water: { p: 5, c: 0, m: 0.7 },
      food: { p: 0, c: 1.2, m: 2.6 }, machinery: { p: 0, c: 0.6, m: 2.0 },
      meds: { p: 0, c: 0.06, m: 2.4 }, electronics: { p: 0, c: 0.15, m: 2.2 },
    },
  },
  {
    id: 'eros-camp', name: 'Eros Camp', body: 'eros', rPark: 3.5e4,
    tech: 2, spread: 0.08, mining: { yield: 10, goods: ['pgm', 'iron'] },
    econ: {
      pgm: { p: 0.9, c: 0, m: 0.5 }, iron: { p: 26, c: 0, m: 0.55 },
      water: { p: 0, c: 3.5, m: 2.3 }, food: { p: 0, c: 1.5, m: 2.5 },
      machinery: { p: 0, c: 0.8, m: 1.9 }, h2: { p: 0, c: 2, m: 2.2 },
    },
  },
  {
    id: 'ceres-anchor', name: 'Ceres Anchorage', body: 'ceres', rPark: 8.0e5,
    tech: 4, spread: 0.045, mining: { yield: 14, goods: ['ice', 'nh3'] },
    econ: {
      water: { p: 34, c: 0, m: 0.45 }, ice: { p: 60, c: 0, m: 0.35 },
      nh3: { p: 12, c: 0, m: 0.55 }, o2: { p: 20, c: 0, m: 0.6 },
      h2: { p: 9, c: 0, m: 0.85 },
      machinery: { p: 0, c: 2.2, m: 1.55 }, electronics: { p: 0, c: 0.6, m: 1.8 },
      food: { p: 0, c: 6, m: 1.65 }, meds: { p: 0, c: 0.25, m: 1.9 },
    },
  },
  {
    id: 'vesta-dig', name: 'Vesta Diggings', body: 'vesta', rPark: 5.5e5,
    tech: 3, spread: 0.06, mining: { yield: 11, goods: ['iron', 'ree'] },
    econ: {
      iron: { p: 45, c: 0, m: 0.5 }, silicates: { p: 55, c: 0, m: 0.4 },
      ree: { p: 3.2, c: 0, m: 0.6 },
      water: { p: 0, c: 7, m: 1.9 }, food: { p: 0, c: 3.2, m: 2.1 },
      machinery: { p: 0, c: 1.6, m: 1.7 }, o2: { p: 0, c: 5, m: 1.8 },
    },
  },
  {
    id: 'psyche-forge', name: 'Psyche Forge', body: 'psyche', rPark: 2.6e5,
    tech: 3, spread: 0.06, mining: { yield: 13, goods: ['iron', 'pgm'] },
    econ: {
      iron: { p: 70, c: 0, m: 0.4 }, pgm: { p: 1.8, c: 0, m: 0.45 },
      ree: { p: 2.4, c: 0, m: 0.65 },
      water: { p: 0, c: 8, m: 2.1 }, h2: { p: 0, c: 5, m: 2.3 },
      food: { p: 0, c: 3, m: 2.3 }, machinery: { p: 0, c: 1.8, m: 1.8 },
    },
  },
  {
    id: 'callisto-skim', name: 'Callisto Skim', body: 'jupiter', rPark: 1.8827e9,
    tech: 4, spread: 0.05, mining: null,
    econ: {
      h2: { p: 55, c: 0, m: 0.35 }, he3: { p: 0.035, c: 0, m: 0.5 },
      d2: { p: 2.2, c: 0, m: 0.5 }, ch4: { p: 8, c: 0, m: 0.7 },
      food: { p: 0, c: 5, m: 2.2 }, electronics: { p: 0, c: 0.8, m: 2.0 },
      machinery: { p: 0, c: 2, m: 1.9 }, meds: { p: 0, c: 0.3, m: 2.2 },
    },
  },
  {
    id: 'titan-cryo', name: 'Titan Cryoworks', body: 'saturn', rPark: 1.2218e9,
    tech: 3, spread: 0.06, mining: null,
    econ: {
      ch4: { p: 40, c: 0, m: 0.35 }, nh3: { p: 22, c: 0, m: 0.45 },
      polymers: { p: 8, c: 0, m: 0.6 }, ice: { p: 25, c: 0, m: 0.5 },
      meds: { p: 0, c: 0.35, m: 2.5 }, electronics: { p: 0, c: 0.7, m: 2.3 },
      pgm: { p: 0, c: 0.7, m: 2.1 }, food: { p: 0, c: 4, m: 2.4 },
    },
  },
  {
    id: 'oberon', name: 'Oberon Outstation', body: 'uranus', rPark: 5.835e8,
    tech: 2, spread: 0.08, mining: null,
    econ: {
      d2: { p: 3.0, c: 0, m: 0.4 }, he3: { p: 0.05, c: 0, m: 0.42 },
      nh3: { p: 15, c: 0, m: 0.5 },
      food: { p: 0, c: 3, m: 3.0 }, meds: { p: 0, c: 0.3, m: 3.0 },
      electronics: { p: 0, c: 0.6, m: 2.8 }, machinery: { p: 0, c: 1.4, m: 2.4 },
    },
  },
  {
    id: 'triton-deep', name: 'Triton Deepwater', body: 'neptune', rPark: 3.548e8,
    tech: 2, spread: 0.085, mining: null,
    econ: {
      nh3: { p: 18, c: 0, m: 0.45 }, h2: { p: 20, c: 0, m: 0.5 },
      ice: { p: 40, c: 0, m: 0.35 }, d2: { p: 2.0, c: 0, m: 0.45 },
      food: { p: 0, c: 3, m: 3.2 }, meds: { p: 0, c: 0.3, m: 3.2 },
      electronics: { p: 0, c: 0.6, m: 3.0 }, machinery: { p: 0, c: 1.4, m: 2.6 },
    },
  },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
export const stationsAtBody = (bodyId) => STATIONS.filter((s) => s.body === bodyId);