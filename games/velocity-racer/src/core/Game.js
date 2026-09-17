import * as THREE from 'three';

import { Loop } from './Loop.js';
import { Input, NEUTRAL_CONTROLS } from './Input.js';
import { Clock } from './Clock.js';

import { Renderer } from '../render/Renderer.js';
import { CockpitCamera } from '../render/Camera.js';
import { PostFX } from '../render/PostFX.js';
import { updateRelativity } from '../render/RelativisticMaterial.js';

import { Track } from '../world/Track.js';
import { Props } from '../world/Props.js';
import { Sky } from '../world/Sky.js';

import { Car } from '../physics/Car.js';
import { TrackPhysics } from '../physics/TrackPhysics.js';

import { HUD } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { EngineAudio } from '../audio/Engine.js';

import { clamp } from '../relativity/constants.js';

const TOTAL_LAPS = 3;
const BEST_KEY = 'velocity-racer.bestLap';
const EFFECT_KEY = 'velocity-racer.effect';

/** Menu → Countdown → Race → Results (with Paused). */
export class Game {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.state = 'loading';
    this.time = 0;
    this.totalLaps = TOTAL_LAPS;

    const storedEffect = parseFloat(localStorage.getItem(EFFECT_KEY));
    this.effect = Number.isFinite(storedEffect) ? clamp(storedEffect, 0, 1) : 1;
    const storedBest = parseFloat(localStorage.getItem(BEST_KEY));
    this.best = Number.isFinite(storedBest) && storedBest > 0 ? storedBest : Infinity;

    this.lap = 1;
    this.lapTimes = [];
    this.lapStart = { coord: 0, proper: 0 };
    this.countdown = 0;
  }

  // ------------------------------------------------------------------ boot

  async init() {
    this.renderer = new Renderer(this.canvas);
    this.scene = new THREE.Scene();

    this.track = await Track.load('./assets/tracks/photon-circuit.json');
    this.scene.add(this.track.group);

    this.props = new Props(this.track);
    this.scene.add(this.props.group);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.car = new Car();
    this.physics = new TrackPhysics(this.track, this.props);
    this.camera = new CockpitCamera();
    this.postfx = new PostFX();

    this.hud = new HUD();
    this.menu = new Menu();
    this.input = new Input();
    this.clock = new Clock();
    this.audio = new EngineAudio();

    this.loop = new Loop({
      update: (dt) => this.update(dt),
      render: (dt) => this.render(dt),
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.state = 'menu';
    this.hud.setVisible(false);
    this.menu.showStart({
      best: this.best,
      effect: this.effect,
      trackName: this.track.name,
      laps: this.totalLaps,
    });
  }

  start() {
    this.loop.start();
  }

  resize() {
    const { w, h } = this.renderer.resize();
    this.camera.object.aspect = w / Math.max(1, h);
    this.camera.object.updateProjectionMatrix();
  }

  // --------------------------------------------------------------- flow

  setEffect(value) {
    this.effect = clamp(value, 0, 1);
    localStorage.setItem(EFFECT_KEY, String(this.effect));
    this.hud.flash(`FX ${Math.round(this.effect * 100)}%`, 0.5);
  }

  beginRace() {
    this.audio.init();
    this.car.reset(0, 0);
    this.props.reset();
    this.clock.reset();
    this.lap = 1;
    this.lapTimes = [];
    this.lapStart = { coord: 0, proper: 0 };
    this.countdown = 3.999;
    this.state = 'countdown';
    this.menu.hide();
    this.hud.setVisible(true);
  }

  pause() {
    if (this.state !== 'race') return;
    this.state = 'paused';
    this.menu.showPause({ effect: this.effect });
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'race';
    this.menu.hide();
  }

  finish() {
    this.state = 'results';
    const isNewBest = this.lapTimes.some((l) => l.coord <= this.best + 1e-9);
    this.menu.showResults({
      lapTimes: this.lapTimes,
      coord: this.clock.coordinate,
      proper: this.clock.proper,
      best: this.best,
      isNewBest,
    });
  }

  // --------------------------------------------------------------- update

  update(dt) {
    this.input.update();
    const input = this.input;

    if (input.consume('effectUp')) this.setEffect(this.effect + 0.1);
    if (input.consume('effectDown')) this.setEffect(this.effect - 0.1);
    if (input.consume('effectToggle')) this.setEffect(this.effect > 0 ? 0 : 1);
    if (input.consume('mute')) {
      this.audio.muted = !this.audio.muted;
      this.hud.flash(this.audio.muted ? 'MUTED' : 'SOUND ON', 0.5);
    }

    switch (this.state) {
      case 'menu':
        if (input.consume('confirm') || input.consume('boost')) this.beginRace();
        break;

      case 'countdown': {
        const prev = Math.ceil(this.countdown);
        this.countdown -= dt;
        const now = Math.ceil(this.countdown);
        if (now !== prev) {
          if (now > 0) {
            this.hud.setMessage(String(now), 1.0);
            this.audio.chime(540 + now * 60, 0.12);
          }
        }
        if (this.countdown <= 0) {
          this.state = 'race';
          this.hud.setMessage('GO!', 0.9);
          this.audio.chime(1180, 0.22);
        }
        // idle on the grid (engine sound only)
        this.car.update(dt, NEUTRAL_CONTROLS);
        break;
      }

      case 'race': {
        if (input.consume('pause')) { this.pause(); break; }
        if (input.consume('restart')) { this.beginRace(); break; }
        const controls = input.controls();
        this.car.update(dt, controls);
        const events = this.physics.step(this.car, dt);
        this.clock.advance(dt, this.car.gamma);
        for (const ev of events) this.onEvent(ev);
        break;
      }

      case 'paused':
        if (input.consume('pause') || input.consume('confirm')) this.resume();
        else if (input.consume('restart')) this.beginRace();
        break;

      case 'results':
        if (input.consume('confirm') || input.consume('restart') || input.consume('boost')) {
          this.beginRace();
        }
        break;

      default:
        break;
    }

    this.input.endFrame();
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'photon':
        this.car.addBoost(0.22);
        this.audio.chime(1560, 0.1);
        this.hud.flash('+PHOTON', 0.4);
        break;

      case 'pad':
        this.audio.chime(760, 0.12);
        break;

      case 'lap': {
        const coord = this.clock.coordinate - this.lapStart.coord;
        const proper = this.clock.proper - this.lapStart.proper;
        this.lapTimes.push({ coord, proper });
        this.lapStart = { coord: this.clock.coordinate, proper: this.clock.proper };

        let msg = `LAP ${this.lap}`;
        if (coord < this.best) {
          this.best = coord;
          localStorage.setItem(BEST_KEY, String(coord));
          msg = 'BEST LAP';
        }
        this.lap += 1;
        if (this.lap > this.totalLaps) {
          this.finish();
        } else {
          this.hud.setMessage(msg, 1.2);
          this.audio.chime(980, 0.16);
        }
        break;
      }

      default:
        break;
    }
  }

  // --------------------------------------------------------------- render

  render(dt) {
    this.time += dt;
    const car = this.car;

    this.camera.update(this.track, car, dt, this.input.isDown('lookBack'));
    updateRelativity(
      this.camera.object,
      this.camera.velocityDir,
      car.beta,
      this.effect,
      this.time,
    );

    this.sky.update(this.camera.object);
    this.props.update(dt);

    this.renderer.render(this.scene, this.camera.object);
    this.postfx.render(this.renderer.gl, car.beta, this.effect, this.time);

    if (this.state !== 'menu') {
      this.hud.update({
        mph: car.mph,
        beta: car.beta,
        gamma: car.gamma,
        boost: car.boost,
        proper: this.clock.proper,
        coord: this.clock.coordinate,
        lap: this.lap,
        laps: this.totalLaps,
        best: this.best,
        effect: this.effect,
      });
    }

    this.audio.update(car, this.state === 'race' || this.state === 'countdown');
  }
}