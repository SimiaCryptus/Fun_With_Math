// Phase 1 debug presets (same schema as levels/*.json).
const g = { g: 9.81, up: [0, 1, 0] };

export const PRESETS = {
  'floor-ceiling': {
    name: 'floor-ceiling',
    gravity: g,
    portals: [
      { id: 1, center: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, -1], radius: 1.25, linkId: 2 },
      { id: 2, center: [0, 2.5, 0], normal: [0, -1, 0], up: [0, 0, -1], radius: 1.25, linkId: 1 },
    ],
    emitter: { seed: 1234, center: [0, 3.5, 0], spread: [1.2, 0.1, 1.2], velocity: [0, -1, 0], velocityJitter: 0.2, rate: 25, max: 250 },
  },
  'wall-wall': {
    name: 'wall-wall',
    gravity: g,
    portals: [
      { id: 1, center: [-3, 1.5, 0], normal: [1, 0, 0], radius: 1, linkId: 2 },
      { id: 2, center: [3, 1.5, 0], normal: [-1, 0, 0], radius: 1, linkId: 1 },
    ],
    emitter: { seed: 7, center: [0, 1.5, 0], spread: [0.5, 0.5, 0.5], velocity: [-2, 3, 0], velocityJitter: 0.4, rate: 15, max: 200 },
  },
  'tilt-45': {
    name: 'tilt-45',
    gravity: g,
    portals: [
      { id: 1, center: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, -1], radius: 1, linkId: 2 },
      { id: 2, center: [3, 2.5, 0], normal: [-0.7071067811865476, -0.7071067811865476, 0], radius: 1, linkId: 1 },
    ],
    emitter: { seed: 42, center: [0, 3, 0], spread: [0.6, 0.1, 0.6], velocity: [0, 0, 0], rate: 20, max: 250 },
  },
  'unequal-radii': {
    name: 'unequal-radii',
    gravity: g,
    portals: [
      { id: 1, center: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, -1], radius: 1.4, linkId: 2 },
      { id: 2, center: [0, 2.5, 0], normal: [0, -1, 0], up: [0, 0, -1], radius: 0.7, linkId: 1 },
    ],
    emitter: { seed: 99, center: [0, 3.5, 0], spread: [0.5, 0.1, 0.5], velocity: [0, -1, 0], rate: 20, max: 250 },
  },
   'rain': {
     name: 'rain',
     gravity: g,
     portals: [
       { id: 1, center: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, -1], radius: 1.25, linkId: 2 },
       { id: 2, center: [0, 2.5, 0], normal: [0, -1, 0], up: [0, 0, -1], radius: 1.25, linkId: 1 },
     ],
     emitter: { mode: 'rain', seed: 5, center: [0, 0, 0], height: 6, size: 4, speed: 0, rate: 80, max: 1500, lifetime: 6 },
   },
};