import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Loop } from './core/Loop.js';
import { bus } from './core/EventBus.js';
import { Race } from './game/Race.js';
import { MudTerrain } from './render/MudTerrain.js';
import { Environment } from './render/Environment.js';
import { VehicleRig } from './render/VehicleRig.js';
import { CameraRig } from './render/CameraRig.js';
import { HUD } from './ui/HUD.js';
import { AudioBus } from './audio/AudioBus.js';
import { unlockedGears } from './temporal/gears.js';
import { NanGuard } from './dev/NanGuard.js';
import sludge from './track/tracks/sludge-speedway.js';

const TRACKS = { 'sludge-speedway': sludge };
const COLORS = { player: 0xb4471f, grittyGus: 0x6b4a12, slickSally: 0xc9c9d6, boggyBill: 0x4d6b1f, turboTadpole: 0xd8a41f };

export async function boot({ glCanvas, hudCanvas, gearRow, trackId = 'sludge-speedway' }) {
  const track = TRACKS[trackId];
  const race = new Race(track, { difficulty: 1, aiCount: 4 });
  const amb = track.ambience || {};

  // ---------- render ----------
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // No flat background colour: the Environment sky dome covers every direction.
  scene.fog = new THREE.Fog(amb.fog ?? 0x8f7546, 160, 1300);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 2000);
  const camRig = new CameraRig(camera, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });

  // ---------- lighting ----------
  const SUN_DIR = new THREE.Vector3(0.45, 0.72, 0.32).normalize();
  scene.add(new THREE.HemisphereLight(amb.horizon ?? 0x9a7c4c, 0x2a1d0c, 0.7));
  const sun = new THREE.DirectionalLight(amb.sun ?? 0xffe2b0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -130; sc.right = sc.top = 130; sc.near = 20; sc.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // ---------- world ----------
  const terrain = new MudTerrain(scene, race.mud, race.spline, amb);
  const env = new Environment(scene, { spline: race.spline, field: race.mud, track, sunDir: SUN_DIR, palette: amb });
  const rigs = new Map();
  for (const v of race.all) {
    rigs.set(v, new VehicleRig(scene, { color: COLORS[v.id] ?? 0x888888, isPlayer: v === race.player }));
  }

  const hud = new HUD(hudCanvas);
  const audio = new AudioBus();
  await audio.resume();

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---------- orbit camera (C to toggle) ----------
  const orbit = new OrbitControls(camera, glCanvas);
  orbit.enabled = false;
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.enablePan = false;
  orbit.minDistance = 4;
  orbit.maxDistance = 260;
  orbit.maxPolarAngle = Math.PI * 0.49;
  let camMode = 'chase';
  const _orbitTarget = new THREE.Vector3();

  function toggleCamera() {
    camMode = camMode === 'chase' ? 'orbit' : 'chase';
    orbit.enabled = camMode === 'orbit';
    if (orbit.enabled) {
      const p = race.player.body.pos;
      orbit.target.set(p.x, p.y + 1.2, p.z);
      camera.fov = camRig.baseFov;
      camera.updateProjectionMatrix();
      camera.up.set(0, 1, 0);
      orbit.update();
    } else {
      camRig.snapTo(camera.position);
    }
    hud.showStamp(orbit.enabled ? 'ORBIT CAM!' : 'CHASE CAM!');
  }

  // ---------- gear buttons ----------
  const buttons = new Map();
  for (const g of unlockedGears()) {
    const b = document.createElement('button');
    b.className = 'gear';
    b.textContent = `${g.id} · ${g.offset}s`;
    b.title = g.blurb;
    b.addEventListener('click', () => race.snapback.selectGear(g.id));
    gearRow.appendChild(b);
    buttons.set(g.id, b);
  }
  const syncButtons = () => {
    for (const [id, b] of buttons) {
      b.setAttribute('aria-pressed', String(id === race.snapback.gearId));
      b.disabled = (race.snapback.cooldowns.get(id) || 0) > 0 || race.snapback.switchLockout > 0;
    }
  };

  // ---------- input ----------
  const keys = new Set();
  const raw = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);
  const clamp11 = (v) => (Number.isFinite(v) ? (v < -1 ? -1 : v > 1 ? 1 : v) : 0);

  // Wrap applyInput on every vehicle that exposes one so the sim can never see an
  // out-of-range / non-finite command. (AI write body.input directly; VehicleBody.step()
  // sanitises for everyone as the hard guarantee.)
  const sanitizeInput = (s) => ({
    throttle: clamp01(s?.throttle),
    brake: clamp01(s?.brake),
    steer: clamp11(s?.steer),
    handbrake: !!s?.handbrake
  });
  for (const v of race.all) {
    if (typeof v.applyInput !== 'function') continue;
    const apply = v.applyInput.bind(v);
    v.applyInput = (inp) => apply(sanitizeInput(inp));
  }

  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') fireSnapback();
    if (e.code === 'Digit1') race.snapback.selectGear('T1');
    if (e.code === 'Digit2') race.snapback.selectGear('T2');
    if (e.code === 'Digit3') race.snapback.selectGear('T3');
    if (e.code === 'KeyC' && !e.repeat) toggleCamera();
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  function fireSnapback() {
    const ev = race.requestSnapback(loop.tick);
    if (!ev) hud.showStamp(race.snapback.armed ? 'NOT YET!!' : 'HIT 88!!');
  }
  let prevRB = false;
  let prevY = false;

  function readInput() {
    const up = keys.has('KeyW') || keys.has('ArrowUp');
    const dn = keys.has('KeyS') || keys.has('ArrowDown');
    const l = keys.has('KeyA') || keys.has('ArrowLeft');
    const r = keys.has('KeyD') || keys.has('ArrowRight');
    raw.throttle = up ? 1 : 0;
    raw.brake = dn ? 1 : 0;
    raw.steer = (r ? 1 : 0) - (l ? 1 : 0);
    raw.handbrake = keys.has('Space');

    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      raw.throttle = Math.max(raw.throttle, pad.buttons[7]?.value ?? 0);
      raw.brake = Math.max(raw.brake, pad.buttons[6]?.value ?? 0);
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) raw.steer = ax;
      raw.handbrake = raw.handbrake || !!pad.buttons[0]?.pressed;
      // Gamepad objects are fresh snapshots each poll, so edge state has to live here.
      const rb = !!pad.buttons[5]?.pressed;
      if (rb && !prevRB) fireSnapback();
      prevRB = rb;
      const y = !!pad.buttons[3]?.pressed;
      if (y && !prevY) toggleCamera();
      prevY = y;
    }
    return sanitizeInput(raw);
  }

  // ---------- event wiring (render/audio only) ----------
  bus.on('snapback', (ev) => {
    camRig.onSnapback(ev);
    audio.play(ev.sfx, 1);
    hud.showStamp(ev.clamped ? 'TOO YOUNG!!' : ev.gearId === 'T3' ? 'SKREEEEEE!' : ev.gearId === 'T2' ? 'BLORP!' : 'boink!');
  });
  bus.on('crash', (e) => { if (e.id === 'player') hud.showStamp(e.kind === 'stuck' ? 'GLORPED!' : 'YOU IDJIT!'); });
  bus.on('lap', (e) => { if (e.id === 'player') hud.showStamp('ANOTHER LAP!'); });
  bus.on('finish', (e) => hud.showStamp(e.standings[0] === 'player' ? 'FILTHY VICTORY!' : 'YOU LOSE, DUMMY!'));

  // ---------- loop ----------
  // Flip DEBUG_NAN off for release. `halt: true` freezes on the first trip if you
  // want to poke at window.MT.race in the console; otherwise it repairs + logs.
  const DEBUG_NAN = true;
  const guard = DEBUG_NAN
    ? new NanGuard(race, { halt: false, maxReports: 4, onHalt: () => loop.stop() })
    : null;

  const loop = new Loop({
    fixedUpdate: (dt, tick) => {
      race.player.applyInput(readInput());
      guard?.probe('pre-sim', tick);
      race.fixedUpdate(dt, tick);
      guard?.probe('post-sim', tick);
    },
    render: (alpha, dt) => {
      for (const [v, rig] of rigs) rig.update(v.body, dt);
      terrain.sync();

      // shadow frustum rides with the player so shadows stay crisp anywhere on track
      const p = race.player.body.pos;
      sun.position.set(p.x + SUN_DIR.x * 260, SUN_DIR.y * 260, p.z + SUN_DIR.z * 260);
      sun.target.position.set(p.x, 0, p.z);

      if (camMode === 'orbit') {
        _orbitTarget.set(p.x, p.y + 1.2, p.z);
        orbit.target.lerp(_orbitTarget, 1 - Math.exp(-8 * dt));
        orbit.update();
      } else {
        camRig.update(race.player.body, dt);
      }
      env.update(camera);

      audio.updateEngine(race.player.body);
      renderer.render(scene, camera);
      hud.draw(race, dt);
      syncButtons();
    }
  });
  loop.start();

  // expose for debugging / telemetry
  window.MT = { race, loop, renderer, scene, camera, hud, audio, guard, env, orbit };
  return window.MT;
}