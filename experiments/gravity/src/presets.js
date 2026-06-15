import { Body } from "./body.js";

// All positions in world units centered around origin (0,0).
export const presets = {
  binary: {
    label: "Stable Binary",
    params: { G: 1, c: 1000, alpha: 0, dt: 0.01, epsilon: 2 },
    bodies: () => [
      new Body({ position: { x: -80, y: 0 }, velocity: { x: 0, y: 1.6 }, mass: 100, color: "#5ad1ff", radius: 10 }),
      new Body({ position: { x: 80, y: 0 }, velocity: { x: 0, y: -1.6 }, mass: 100, color: "#ff7b5a", radius: 10 }),
    ],
  },

  precessing: {
    label: "Precessing Orbit",
    params: { G: 1, c: 24, alpha: 0.6, dt: 0.008, epsilon: 2 },
    bodies: () => [
      new Body({ position: { x: 0, y: 0 }, velocity: { x: 0, y: -0.3 }, mass: 400, color: "#ffd45a", radius: 16 }),
      new Body({ position: { x: 130, y: 0 }, velocity: { x: 0, y: 1.9 }, mass: 20, color: "#5ad1ff", radius: 7 }),
    ],
  },

  chaotic: {
    label: "Chaotic Fly-by",
    params: { G: 1, c: 18, alpha: 0.4, dt: 0.006, epsilon: 1.5 },
    bodies: () => [
      new Body({ position: { x: -120, y: -30 }, velocity: { x: 1.2, y: 0.4 }, mass: 160, color: "#5aff9d", radius: 11 }),
      new Body({ position: { x: 120, y: 40 }, velocity: { x: -1.1, y: 0.6 }, mass: 120, color: "#ff5ad1", radius: 9 }),
    ],
  },
};

export const presetKeys = Object.keys(presets);