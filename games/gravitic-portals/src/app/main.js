import * as THREE from 'three';
import * as V from '../core/vec3.js';
import { PRESETS } from '../core/presets.js';
import { createWorldFromLevel } from '../core/level.js';
import { normalFromYawPitch, defaultUp } from '../core/portal.js';
import { createEmitter } from '../core/sim/emitter.js';
import { solveReferencePairs } from '../core/field/reference.js';
import { decodeTable } from '../core/field/table.js';
import { PortalMeshes } from '../render/portalMesh.js';
import { FieldViz } from '../render/fieldViz.js';
import { ParticlesView } from '../render/particlesView.js';
import { createOrbitControls } from './controls.js';
import { createHud } from './hud.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(6, 4, 8);
const controls = createOrbitControls(camera, renderer.domElement);

const grid = new THREE.GridHelper(20, 20, 0x334455, 0x1d2633);
grid.position.y = -0.001;
scene.add(grid, new THREE.AxesHelper(0.5));

const portalMeshes = new PortalMeshes(scene);
const fieldViz = new FieldViz(scene);
const particlesView = new ParticlesView(scene);

const app = {
  presetName: 'floor-ceiling',
  world: null,
  emitter: null,
  paused: false,
   fieldSource: 'runtime',
   table: null,
  reference: null,
  referenceVersion: -1,
  vizVersion: -1,
  vizDirty: true,
  viz: { arrows: true, slice: true, sliceMode: 'geff', sliceOffset: 0, streams: true },
   terms: { disks: true, gap: true },
};

function loadPreset(name) {
  app.presetName = name;
  const level = structuredClone(PRESETS[name]);
   const { world, emitter } = createWorldFromLevel(level, { terms: app.terms, table: app.table });
  app.world = world;
   app.emitter = emitter ?? createEmitter({ mode: 'fountain' });
  app.referenceVersion = -1;
  app.vizDirty = true;
  hud.setPortals(world.fieldSystem.portals);
   hud.setEmitter(app.emitter);
}

function currentSampler() {
  const fs = app.world.fieldSystem;
  const bg = fs.background;
  if (app.fieldSource === 'reference' && fs.pairs.length > 0) {
    if (app.referenceVersion !== fs.version) {
      app.reference = solveReferencePairs(fs.pairs, bg, { rings: 10, sectors: 16 });
      app.referenceVersion = fs.version;
    }
    const ref = app.reference;
    return {
      field: (x) => ref.field(x),
      potential: (x) => bg.potential(x) + ref.potential(x),
      geff: (x) => V.add(bg.accel(x), ref.field(x)),
    };
  }
  return {
    field: (x) => fs.field(x),
    potential: (x) => fs.totalPotential(x),
    geff: (x) => fs.geff(x),
  };
}

const hud = createHud(document.getElementById('hud'), app, {
  presets: PRESETS,
  onPreset: (name) => loadPreset(name),
  onFieldSource: (s) => { app.fieldSource = s; app.vizDirty = true; },
  onTerms: (t) => { Object.assign(app.terms, t); app.world.fieldSystem.setTerms(t); },
  onViz: (v) => { Object.assign(app.viz, v); app.vizDirty = true; },
  onPortalEdit: (id, e) => {
    const normal = normalFromYawPitch(e.yaw, e.pitch);
    app.world.fieldSystem.updatePortal(id, { center: e.center, normal, up: defaultUp(normal), radius: e.radius });
  },
   onEmitterMode: (m) => { app.emitter.setMode(m); hud.setEmitter(app.emitter); },
   onBurst: () => app.emitter.burst(app.world, 100),
  onClear: () => app.world.clearParticles(),
  onTogglePause: () => { app.paused = !app.paused; },
});

loadPreset(app.presetName);
// Batch-generated field table (npm run tabulate). Without it, pairs are solved directly.
fetch('./assets/field-table.bin')
   .then((r) => (r.ok ? r.arrayBuffer() : null))
   .then((buf) => {
     if (!buf) return;
     app.table = decodeTable(buf);
     app.world.fieldSystem.setTable(app.table);
   })
   .catch((e) => console.warn('field table unavailable, using direct solves', e));


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
let acc = 0;
let frameNo = 0;
let fps = 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dtF = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (dtF > 0 ? 1 / dtF : 60) * 0.05;
  const world = app.world;

  if (!app.paused) {
    acc += dtF;
    let n = 0;
    while (acc >= world.dt && n < 12) {
      app.emitter?.step(world);
      world.step();
      acc -= world.dt;
      n++;
    }
    if (n === 12) acc = 0;
  }

  const version = world.fieldSystem.version;
  if (app.vizDirty || version !== app.vizVersion) {
    fieldViz.rebuild(currentSampler(), world.fieldSystem, app.viz);
    portalMeshes.sync(world.fieldSystem.portals);
    app.vizVersion = version;
    app.vizDirty = false;
  }

  particlesView.update(world, app.paused ? 1 : acc / world.dt);

  if (frameNo++ % 30 === 0) {
    let maxGain = -Infinity, crossings = 0;
    const sample = world.particles.slice(0, 60);
    for (const p of sample) {
      maxGain = Math.max(maxGain, world.energy(p) - p.e0);
      crossings += p.crossings;
    }
    const fs = world.fieldSystem;
    const pair = fs.pairs[0];
    let center = '';
    if (pair) {
      const mid = V.lerp(pair.a.center, pair.b.center, 0.5);
       const inf = fs.model.info[0];
       const src = inf ? `field: ${inf.source}  d=${inf.params.d.toFixed(2)} θ=${(inf.params.theta * 57.3).toFixed(0)}°` : 'field: off';
       center = `|g_eff| @ pair midpoint: ${V.length(fs.geff(mid)).toFixed(3)} m/s²\nΔΦ: ${pair.dPhi.toFixed(2)}  λ: ${pair.lambda.toFixed(2)}\n${src}`;
    }
    hud.setStats(
      `fps ${fps.toFixed(0)}  t=${world.time.toFixed(1)}s\n` +
      `particles ${world.particles.length}  crossings ${crossings}\n` +
      `max ΔE (sample) ${sample.length ? maxGain.toFixed(4) : '—'}\n${center}`,
    );
  }

  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);