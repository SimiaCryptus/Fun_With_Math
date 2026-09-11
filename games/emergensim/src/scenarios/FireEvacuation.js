/**
 * Chemistry lab thermal spread. Lesson: fire doors control oxygen and thermal isolation;
 * the west exit is closest but sits next to the burning lab, so rumours about it spread fast.
 *
 *  x: 0123456789012345678901234 5
 */
export const FireEvacuation = {
  id: 'fire-evacuation',
  title: 'Chemistry Lab Evacuation',
  description: 'A solvent fire has started in the chemistry lab and the lab door was left open. Get at least 75% of the building out before responders arrive, with no more than two people incapacitated. Closing doors behind you buys turns.',
  mode: 'EVACUATE',
  seed: 4101,
  responderEtaTurns: 14,
  maxTurns: 22,
  groupCohesion: 0.5,
  alarmActive: false,
  floors: [[
    '##WW######WWWW#######WW###', // y0
    '#CC.......#.........#,,,,#', // y1  Lab | Classroom A | Office
    '#C........#.........#,,,,#', // y2
    '#.........#.........#,,,,#', // y3
    '#.........#.........#,,,,#', // y4
    '#.........#.........#,,,,#', // y5
    '####/##########+######+###', // y6  doors: lab (open!), A, office
    'E........................E', // y7  corridor, west + east exits
    '#........................#', // y8
    '####+##########+#####+####', // y9  doors: art room, B, storage
    '#.........#.........#....#', // y10 Art room | Classroom B | Storage
    '#.........#.........#....#', // y11
    '#.........#.........#....#', // y12
    '#.........#.........#....#', // y13
    '#####E####################', // y14 fire exit from art room
  ]],
  tileOverrides: [
    { x: 4, y: 6, z: 0, label: 'Lab fire door' },
    { x: 0, y: 7, z: 0, label: 'West exit' },
    { x: 25, y: 7, z: 0, label: 'East exit' },
    { x: 5, y: 14, z: 0, label: 'Art room fire exit' },
    { x: 3, y: 2, z: 0, flammability: 0.8, fuelCapacity: 110, label: 'Reagent shelf' },
    { x: 4, y: 3, z: 0, flammability: 0.8, fuelCapacity: 110, label: 'Bench' },
    { x: 5, y: 3, z: 0, flammability: 0.8, fuelCapacity: 110, label: 'Bench' },
    { x: 23, y: 11, z: 0, flammability: 0.7, fuelCapacity: 120, label: 'Paper stock' },
  ],
  player: { position: { x: 6, y: 7, z: 0 }, inventory: ['BARRICADE_KIT'] },
  initialHazards: [
    { type: 'FIRE', position: { x: 1, y: 1, z: 0 }, intensity: 0.7 },
    { type: 'FIRE', position: { x: 2, y: 1, z: 0 }, intensity: 0.4 },
    { type: 'SMOKE', position: { x: 2, y: 2, z: 0 }, intensity: 0.5 },
    { type: 'SMOKE', position: { x: 1, y: 2, z: 0 }, intensity: 0.4 },
  ],
  agents: [
    // Lab — closest to the fire
    { id: 'priya', name: 'Priya', role: 'STUDENT', position: { x: 7, y: 2, z: 0 }, traits: { fear: 0.8, greed: 0.2, trust: 0.4, rage: 0.1, cohesion: 0.3 } },
    { id: 'marcus', name: 'Marcus', role: 'STUDENT', position: { x: 8, y: 4, z: 0 }, traits: { fear: 0.5, greed: 0.2, trust: 0.6, rage: 0.2, cohesion: 0.6 } },
    // Classroom A
    { id: 'okafor', name: 'Ms. Okafor', role: 'TEACHER', position: { x: 12, y: 2, z: 0 }, traits: { fear: 0.2, greed: 0.1, trust: 0.8, rage: 0.1, cohesion: 0.9 } },
    { id: 'devon', name: 'Devon', role: 'STUDENT', socialRank: 2, position: { x: 14, y: 3, z: 0 }, traits: { fear: 0.2, greed: 0.8, trust: 0.2, rage: 0.9, cohesion: 0.2 } },
    { id: 'sam', name: 'Sam', role: 'STUDENT', position: { x: 15, y: 3, z: 0 }, traits: { fear: 0.5, greed: 0.3, trust: 0.3, rage: 0.2, cohesion: 0.4 } },
    { id: 'lena', name: 'Lena', role: 'STUDENT', position: { x: 17, y: 2, z: 0 }, traits: { fear: 0.4, greed: 0.9, trust: 0.5, rage: 0.2, cohesion: 0.4 } },
    { id: 'theo', name: 'Theo', role: 'STUDENT', position: { x: 13, y: 4, z: 0 }, traits: { fear: 0.3, greed: 0.2, trust: 0.7, rage: 0.1, cohesion: 0.7 } },
    // Office
    { id: 'hale', name: 'Mr. Hale', role: 'TEACHER', position: { x: 22, y: 2, z: 0 }, traits: { fear: 0.3, greed: 0.2, trust: 0.7, rage: 0.2, cohesion: 0.8 } },
    // Art room
    { id: 'aisha', name: 'Aisha', role: 'STUDENT', position: { x: 3, y: 11, z: 0 }, traits: { fear: 0.3, greed: 0.2, trust: 0.6, rage: 0.1, cohesion: 0.7 } },
    { id: 'ben', name: 'Ben', role: 'STUDENT', position: { x: 7, y: 12, z: 0 }, traits: { fear: 0.6, greed: 0.3, trust: 0.4, rage: 0.3, cohesion: 0.4 } },
    // Classroom B
    { id: 'chloe', name: 'Chloe', role: 'STUDENT', position: { x: 13, y: 11, z: 0 }, traits: { fear: 0.3, greed: 0.3, trust: 0.6, rage: 0.2, cohesion: 0.6 } },
    { id: 'ravi', name: 'Ravi', role: 'STUDENT', position: { x: 17, y: 12, z: 0 }, traits: { fear: 0.3, greed: 0.4, trust: 0.3, rage: 0.5, cohesion: 0.3 } },
    // Storage
    { id: 'jordan', name: 'Jordan', role: 'BYSTANDER', position: { x: 23, y: 12, z: 0 }, traits: { fear: 0.4, greed: 0.3, trust: 0.4, rage: 0.2, cohesion: 0.2 } },
  ],
  winConditions: [
    { type: 'EVACUATE_MINIMUM_PERCENT', targetValue: 0.75 },
    { type: 'PREVENT_CASUALTIES', targetValue: 2 },
  ],
  events: [
    { turn: 5, type: 'ALARM', message: 'Smoke detector trips the building alarm' },
  ],
};