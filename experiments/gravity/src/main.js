import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { Controls } from './controls.js';
import { presets } from './presets.js';
import { sub, scale, len } from './vector.js';

const canvas = document.getElementById('sim-canvas');
const controlsMount = document.getElementById('controls');
const readouts = document.getElementById('readouts');

const renderer = new Renderer(canvas);

let currentPreset = 'binary';

function buildSimulation(key) {
  const def = presets[key];
  const sim = new Simulation(def.bodies(), { ...def.params });
  return sim;
}

let simulation = buildSimulation(currentPreset);

// --- control wiring ---
const controls = new Controls(controlsMount, {
  simulation,
  onPreset: (key) => loadPreset(key),
  onPlayPause: () => togglePlay(),
  onStep: () => {
    simulation.step();
    renderer.render(simulation);
    updateReadouts();
  },
  onReset: () => loadPreset(currentPreset),
});

let playing = false;

function togglePlay() {
  playing = !playing;
  controls.setPlaying(playing);
}

function loadPreset(key) {
  currentPreset = key;
  simulation = buildSimulation(key);
  controls.sim = simulation;
  controls.setPreset(key);
  controls.sync();
  playing = false;
  controls.setPlaying(false);
  renderer.render(simulation);
  updateReadouts();
}

// --- interactivity: click to place + drag to set velocity ---
let dragging = null;

canvas.addEventListener('pointerdown', (e) => {
  const screen = { x: e.offsetX, y: e.offsetY };
  const world = renderer.toWorld(screen);
  // find nearest body within grab radius
  let nearest = null;
  let nd = Infinity;
  for (const b of simulation.bodies) {
    const d = len(sub(b.position, world));
    if (d < nd) {
      nd = d;
      nearest = b;
    }
  }
  if (nearest && nd < Math.max(20, nearest.radius * 2)) {
    dragging = { body: nearest, start: world };
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const world = renderer.toWorld({ x: e.offsetX, y: e.offsetY });
  // live preview velocity vector
  dragging.body.velocity = scale(sub(world, dragging.body.position), 0.04);
  if (!playing) renderer.render(simulation);
});

canvas.addEventListener('pointerup', () => {
  if (dragging) {
    simulation.reset(); // reseed history with new state
    controls.sync();
  }
  dragging = null;
});

// --- zoom ---
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    renderer.scaleFactor *= factor;
    if (!playing) renderer.render(simulation);
  },
  { passive: false }
);

// --- readouts ---
function updateReadouts() {
  const E = simulation.totalEnergy();
  const p = simulation.totalMomentum();
  const L = simulation.angularMomentum();
  const precDeg = (simulation.precessionPerOrbit * 180) / Math.PI;
  const totDeg = (simulation.totalPrecession * 180) / Math.PI;
  readouts.innerHTML = `
    t = <span>${simulation.t.toFixed(2)}</span><br/>
    Energy = <span>${E.toFixed(3)}</span><br/>
    |p| = <span>${len(p).toFixed(3)}</span><br/>
    L = <span>${L.toFixed(3)}</span><br/>
    precession/orbit = <span>${precDeg.toFixed(2)}&deg;</span><br/>
    total precession = <span>${totDeg.toFixed(2)}&deg;</span><br/>
    integrator = <span>${simulation.integrator}</span>
  `;
}

// --- animation loop ---
let acc = 0;
function loop() {
  if (playing) {
    // run a few sub-steps per frame for smoothness
    const subSteps = 2;
    for (let i = 0; i < subSteps; i++) simulation.step();
    renderer.render(simulation);
    if (++acc % 6 === 0) updateReadouts();
  }
  requestAnimationFrame(loop);
}

// keyboard: space toggles play, S steps
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 's') {
    simulation.step();
    renderer.render(simulation);
    updateReadouts();
  }
});

renderer.render(simulation);
updateReadouts();
requestAnimationFrame(loop);
