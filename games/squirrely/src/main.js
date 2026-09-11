// Bootstrap: config → sim → render → loop (SPEC §4). This is the only file allowed to be impure and glue everything.
import { TUNING } from './data/tuning.js';
import { DRIVERS, DRIVER_RULES } from './data/drivers.js';
import { LEVELS, endlessLevel } from './data/levels.js';
import { validateAll, validateLevel } from './core/config.js';
import { EventBus } from './core/events.js';
import { createLoop } from './core/loop.js';
import { clamp } from './core/math.js';
import { BODY_TYPES } from './sim/vehicle.js';
import { createDriverRegistry } from './sim/drivers/index.js';
import { World } from './sim/world.js';
import { Renderer } from './render/renderer.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { Sfx } from './audio/sfx.js';

const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    validateAll(DRIVERS, LEVELS, TUNING, Object.keys(BODY_TYPES));
    const canvas = document.getElementById('game');
    this.renderer = new Renderer(canvas, TUNING);
    this.hud = new Hud(DRIVERS, DRIVER_RULES, TUNING);
    this.menus = new Menus();
    this.sfx = new Sfx();
    this.input = new Input(canvas, {
      onPause: () => this.togglePause(),
      onDebug: () => { this.hud.debug = !this.hud.debug; },
    });
    this.loop = createLoop({
      dt: TUNING.dt, maxSubsteps: TUNING.maxSubsteps,
      step: (dt) => this.step(dt),
      render: (alpha, ft) => this.render(alpha, ft),
    });
    this.world = null; this.levelIndex = 0; this.paused = false; this.lastPlayerState = 'idle';
    this.best = Number(localStorage.getItem('squirrely.best')) || 0;
    this.baseSeed = params.has('seed')
      ? Number(params.get('seed')) >>> 0
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.world && !this.paused && this.world.status === 'playing') this.togglePause();
    });
    this.showTitle();
  }

  levelFor(index) {
    return index < LEVELS.length ? LEVELS[index] : endlessLevel(index - LEVELS.length + 1);
  }

  showTitle() {
    const startAt = params.has('level') ? clamp(Number(params.get('level')) - 1, 0, LEVELS.length - 1) : 0;
    const lines = [...this.menus.intro];
    if (this.best > 0) lines.push(`Best score: <b>${this.best}</b>`);
    this.menus.show({
      title: 'Squirrely', lines,
      buttons: [{ label: 'Start', onClick: () => this.start(startAt, {}) }],
    });
  }

  start(index, carry) {
    this.sfx.unlock();
    const level = this.levelFor(index);
    if (level.endless) validateLevel(level, DRIVERS, index);
    const events = new EventBus();
    const drivers = createDriverRegistry(DRIVERS, level.modifiers);
    const seed = (this.baseSeed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
    this.world = new World({ level, drivers, tuning: TUNING, seed, events, carry });
    this.levelIndex = index;
    this.renderer.setWorld(this.world);
    this.hud.bind(this.world, events, `${index + 1} · ${level.name}`);
    this.sfx.bind(events, this.world);
    events.on('level:complete', () => this.onComplete());
    events.on('game:over', () => this.onGameOver());
    events.on('crash', ({ x, z, severity }) => {
      const p = this.world.player, d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      const w = severity === 'wreck' ? 1 : 0.6;
      this.renderer.shake(clamp((w * 60) / (d2 + 40), 0, 0.8));
    });
    events.on('player:death', () => this.renderer.shake(0.5));
    this.menus.hide();
    this.paused = false;
    this.input.reset();
    this.loop.start();
  }

  step(dt) {
    if (!this.world || this.paused) return;
    this.world.step(dt, this.input.sample());
  }

  render(alpha, frameTime) {
    const w = this.world;
    if (!w) return;
    this.loop.setTimeScale(this.paused ? 0 : w.slowMoTimer > 0 ? TUNING.slowMoScale : 1);
    this.renderer.render(w, alpha, frameTime);
    this.hud.update(w, frameTime);
    const st = w.player.state;
    if (st !== this.lastPlayerState) {
      if (st === 'hopping') { if (w.player.dur === TUNING.dashTime) this.sfx.dash(); else this.sfx.hop(); }
      this.lastPlayerState = st;
    }
  }

  togglePause() {
    const w = this.world;
    if (!w || w.status !== 'playing') return;
    this.paused = !this.paused;
    if (!this.paused) { this.menus.hide(); return; }
    const dossier = Object.keys(DRIVERS).map((id) => {
      const p = DRIVERS[id];
      return `<b style="color:#${p.colorHex.toString(16).padStart(6, '0')}">${p.icon} ${p.label}</b> — ${DRIVER_RULES[id]}`;
    });
    this.menus.show({
      title: 'Paused', lines: dossier,
      buttons: [
        { label: 'Resume', onClick: () => this.togglePause() },
        { label: 'Quit to title', onClick: () => { this.paused = false; this.showTitle(); } },
      ],
    });
  }

  saveBest(score) {
    if (score > this.best) { this.best = score; localStorage.setItem('squirrely.best', String(score)); }
  }

  onComplete() {
    const w = this.world, next = this.levelIndex + 1, score = w.scoring.score;
    let lives = w.lives;
    if (next % 2 === 0) lives = Math.min(TUNING.maxLives, lives + 1);   // +1 life every 2 levels (§13.1)
    this.saveBest(score);
    const nl = this.levelFor(next);
    this.menus.show({
      title: 'Crossing complete!',
      lines: [`Score <b>${score}</b> · Lives ${'🐿️'.repeat(lives)}`, `Next: <b>${nl.name}</b>`],
      buttons: [{ label: 'Next level', onClick: () => this.start(next, { score, lives }) }],
    });
  }

  onGameOver() {
    const score = this.world.scoring.score;
    this.saveBest(score);
    this.menus.show({
      title: 'Squashed.',
      lines: [`Score <b>${score}</b> · Best <b>${this.best}</b>`, `Reached level ${this.levelIndex + 1}: ${this.world.level.name}`],
      buttons: [
        { label: 'Retry level', onClick: () => this.start(this.levelIndex, {}) },
        { label: 'Title', onClick: () => this.showTitle() },
      ],
    });
  }
}

new Game();