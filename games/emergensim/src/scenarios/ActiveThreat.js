/**
 * Lockdown scenario. Lesson: noise draws the threat, closed + barricaded doors cost it turns,
 * students caught in the corridor must be pulled into rooms or routed to the east exit.
 *
 *  x: 012345678901234567890123
 */
export const ActiveThreat = {
  id: 'active-threat',
  title: 'Lockdown: West Wing',
  description: 'An intruder has entered the west end of the corridor. Secure your room, get hallway students out of sight, and keep everyone safe for 10 turns until responders arrive. Barricades cost the intruder turns; noise draws it in.',
  mode: 'LOCKDOWN',
  seed: 7331,
  responderEtaTurns: 10,
  maxTurns: 12,
  groupCohesion: 0.55,
  alarmActive: false,
  floors: [[
    '###WW######WW######WW###', // y0
    '#.......#.......#......#', // y1  N1 | N2 (player) | N3
    '#.......#.......#......#', // y2
    '#.......#.......#......#', // y3
    '#.......#.......#......#', // y4
    '###+#######+#######+####', // y5  doors (3,5) (11,5) (19,5)
    '#......................E', // y6  corridor, east exit
    '#......................#', // y7
    '###+#######+#######L####', // y8  doors (3,8) (11,8) (19,8 locked)
    '#.......#.......#......#', // y9  S1 | S2 | S3
    '#.......#.......#......#', // y10
    '#.......#.......#......#', // y11
    '###WW######WW######WW###', // y12
  ]],
  tileOverrides: [
    { x: 11, y: 5, z: 0, label: 'Your classroom door' },
    { x: 23, y: 6, z: 0, label: 'East exit' },
    { x: 19, y: 8, z: 0, label: 'Locked office' },
  ],
  player: { position: { x: 12, y: 2, z: 0 }, inventory: ['BARRICADE_KIT'] },
  initialHazards: [
    {
      type: 'THREAT', id: 'intruder', position: { x: 1, y: 7, z: 0 }, facing: { dx: 0, dy: -1 },
      patrolRoute: [{ x: 21, y: 7, z: 0 }, { x: 21, y: 6, z: 0 }, { x: 1, y: 6, z: 0 }, { x: 1, y: 7, z: 0 }],
    },
  ],
  agents: [
    // N2 — player's room
    { id: 'maya', name: 'Maya', role: 'STUDENT', position: { x: 10, y: 3, z: 0 }, traits: { fear: 0.3, greed: 0.2, trust: 0.7, rage: 0.1, cohesion: 0.7 } },
    { id: 'eli', name: 'Eli', role: 'STUDENT', position: { x: 14, y: 2, z: 0 }, traits: { fear: 0.7, greed: 0.2, trust: 0.5, rage: 0.2, cohesion: 0.5 } },
    { id: 'zoe', name: 'Zoe', role: 'STUDENT', position: { x: 11, y: 1, z: 0 }, traits: { fear: 0.3, greed: 0.4, trust: 0.3, rage: 0.5, cohesion: 0.3 } },
    // Corridor — exposed
    { id: 'noah', name: 'Noah', role: 'STUDENT', position: { x: 10, y: 7, z: 0 }, traits: { fear: 0.6, greed: 0.2, trust: 0.6, rage: 0.2, cohesion: 0.4 } },
    { id: 'ivy', name: 'Ivy', role: 'STUDENT', position: { x: 16, y: 6, z: 0 }, traits: { fear: 0.4, greed: 0.2, trust: 0.7, rage: 0.1, cohesion: 0.6 } },
    // N1
    { id: 'delgado', name: 'Mr. Delgado', role: 'TEACHER', position: { x: 4, y: 2, z: 0 }, traits: { fear: 0.2, greed: 0.1, trust: 0.8, rage: 0.1, cohesion: 0.9 } },
    { id: 'owen', name: 'Owen', role: 'STUDENT', position: { x: 2, y: 3, z: 0 }, traits: { fear: 0.4, greed: 0.3, trust: 0.5, rage: 0.2, cohesion: 0.6 } },
    // N3
    { id: 'hana', name: 'Hana', role: 'STUDENT', position: { x: 19, y: 2, z: 0 }, traits: { fear: 0.3, greed: 0.2, trust: 0.5, rage: 0.2, cohesion: 0.6 } },
    { id: 'kai', name: 'Kai', role: 'STUDENT', position: { x: 21, y: 3, z: 0 }, traits: { fear: 0.8, greed: 0.3, trust: 0.3, rage: 0.2, cohesion: 0.2 } },
    // South rooms
    { id: 'lucas', name: 'Lucas', role: 'STUDENT', position: { x: 5, y: 10, z: 0 }, traits: { fear: 0.4, greed: 0.3, trust: 0.5, rage: 0.3, cohesion: 0.5 } },
    { id: 'nia', name: 'Nia', role: 'STUDENT', position: { x: 12, y: 10, z: 0 }, traits: { fear: 0.3, greed: 0.2, trust: 0.7, rage: 0.1, cohesion: 0.7 } },
    { id: 'park', name: 'Ms. Park', role: 'TEACHER', position: { x: 20, y: 10, z: 0 }, traits: { fear: 0.2, greed: 0.1, trust: 0.8, rage: 0.1, cohesion: 0.9 } },
  ],
  winConditions: [
    { type: 'SURVIVE_TURNS', targetValue: 10 },
    { type: 'PREVENT_CASUALTIES', targetValue: 1 },
  ],
  events: [
    { turn: 1, type: 'ALARM', message: 'Intercom: LOCKDOWN. Lock doors, lights out, stay out of sight.' },
  ],
};