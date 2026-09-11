/**
 * Two-floor structural + severe-weather scenario. Lesson: interior rooms without windows are shelter,
 * upper floors and weakened stairwells become traps after aftershocks, glass is the main injury vector.
 *
 *  x: 01234567890123456789   (same footprint on both floors; stairwell at (10,1))
 */
const FLOOR_UPPER = [
  '####WW########WW####', // y0
  '#......#..S#.......#', // y1  West room | Core (stair) | East room
  '#......#...#.......#', // y2
  '#......+...+.......#', // y3
  '###+#####+######+###', // y4
  '#..................#', // y5  corridor
  '#..................#', // y6
  '###+#####+######+###', // y7
  '#......#...#.......#', // y8  SW room | South core | SE room
  '#......#...#.......#', // y9
  '####WW########WW####', // y10
];

const FLOOR_GROUND = [
  '####WW########WW####', // y0
  '#......#..S#.......#', // y1
  '#......#...#.......#', // y2
  '#......+...+.......#', // y3
  '###+#####+######+###', // y4
  'E..................#', // y5  west exit
  '#..................#', // y6
  '###+#####+######+###', // y7
  '#......#...#.......#', // y8
  '#......#...#.......#', // y9
  '####WW###E####WW####', // y10 south fire exit from south core
];

export const EarthquakeTornado = {
  id: 'earthquake-tornado',
  title: 'Seismic Event & Tornado Warning',
  description: 'A quake has cracked the building and a tornado warning follows. Aftershocks will collapse weakened floors and the stairwell; the storm will shatter every window. Move people to interior rooms away from glass — or downstairs and out — and keep casualties to two or fewer for 11 turns.',
  mode: 'SHELTER',
  seed: 9021,
  responderEtaTurns: 11,
  maxTurns: 14,
  groupCohesion: 0.5,
  alarmActive: false,
  floors: [FLOOR_GROUND, FLOOR_UPPER],
  tileOverrides: [
    { x: 10, y: 1, z: 0, label: 'Stairwell (ground)' },
    { x: 10, y: 1, z: 1, label: 'Stairwell (upper)' },
    { x: 0, y: 5, z: 0, label: 'West exit' },
    { x: 9, y: 10, z: 0, label: 'South fire exit' },
    { x: 9, y: 2, z: 1, label: 'Interior core — shelter' },
    { x: 9, y: 2, z: 0, label: 'Interior core — shelter' },
  ],
  player: { position: { x: 4, y: 5, z: 1 }, inventory: ['BARRICADE_KIT'] },
  initialHazards: [
    { type: 'STRUCTURAL_WEAKNESS', position: { x: 10, y: 1, z: 1 }, intensity: 0.5 }, // stairwell will fail on the 2nd aftershock
    { type: 'STRUCTURAL_WEAKNESS', position: { x: 3, y: 6, z: 1 }, intensity: 0.6 },  // upper corridor
    { type: 'STRUCTURAL_WEAKNESS', position: { x: 13, y: 5, z: 1 }, intensity: 0.6 }, // upper corridor
    { type: 'STRUCTURAL_WEAKNESS', position: { x: 2, y: 5, z: 0 }, intensity: 0.6 },  // near west exit
    { type: 'STRUCTURAL_WEAKNESS', position: { x: 16, y: 4, z: 0 }, intensity: 0.55 }, // ground east-room door
  ],
  agents: [
    // Upper floor
    { id: 'rivera', name: 'Ms. Rivera', role: 'TEACHER', position: { x: 3, y: 2, z: 1 }, traits: { fear: 0.2, greed: 0.1, trust: 0.8, rage: 0.1, cohesion: 0.9 } },
    { id: 'tomas', name: 'Tomas', role: 'STUDENT', position: { x: 5, y: 1, z: 1 }, traits: { fear: 0.6, greed: 0.2, trust: 0.5, rage: 0.2, cohesion: 0.5 } },
    { id: 'ada', name: 'Ada', role: 'STUDENT', position: { x: 14, y: 2, z: 1 }, traits: { fear: 0.3, greed: 0.2, trust: 0.6, rage: 0.1, cohesion: 0.7 } },
    { id: 'finn', name: 'Finn', role: 'STUDENT', position: { x: 15, y: 1, z: 1 }, traits: { fear: 0.5, greed: 0.8, trust: 0.4, rage: 0.3, cohesion: 0.3 } },
    { id: 'grace', name: 'Grace', role: 'STUDENT', position: { x: 17, y: 9, z: 1 }, traits: { fear: 0.7, greed: 0.2, trust: 0.4, rage: 0.2, cohesion: 0.4 } },
    // Ground floor
    { id: 'leo', name: 'Leo', role: 'STUDENT', position: { x: 2, y: 2, z: 0 }, traits: { fear: 0.4, greed: 0.3, trust: 0.5, rage: 0.2, cohesion: 0.6 } },
    { id: 'osei', name: 'Mr. Osei', role: 'TEACHER', position: { x: 13, y: 8, z: 0 }, traits: { fear: 0.2, greed: 0.1, trust: 0.7, rage: 0.1, cohesion: 0.8 } },
    { id: 'yara', name: 'Yara', role: 'STUDENT', position: { x: 15, y: 9, z: 0 }, traits: { fear: 0.5, greed: 0.3, trust: 0.5, rage: 0.2, cohesion: 0.5 } },
    { id: 'sofia', name: 'Sofia', role: 'STUDENT', position: { x: 9, y: 6, z: 0 }, traits: { fear: 0.4, greed: 0.2, trust: 0.7, rage: 0.1, cohesion: 0.6 } },
  ],
  winConditions: [
    { type: 'SURVIVE_TURNS', targetValue: 11 },
    { type: 'PREVENT_CASUALTIES', targetValue: 2 },
  ],
  events: [
    { turn: 2, type: 'AFTERSHOCK', magnitude: 0.35, message: 'Aftershock — the building shudders' },
    { turn: 5, type: 'ALARM', message: 'Weather radio: TORNADO WARNING — interior rooms, away from windows' },
    { turn: 7, type: 'WIND_GUST', message: 'The tornado passes — every window shatters' },
    { turn: 9, type: 'AFTERSHOCK', magnitude: 0.5, message: 'Major aftershock — weakened structure collapses' },
  ],
};