import { CONFIG } from '../config.js';
import { EventBus } from './Events.js';
import { Loop } from './Loop.js';
import { randomSeed, dailySeed } from './Rng.js';
import { World } from '../world/World.js';
import { CELL, ITEM, PICKUP } from '../world/Chunk.js';
import { Player } from '../entities/Player.js';
import { EnemyManager } from '../entities/EnemyManager.js';
import { DeviceManager } from '../items/Devices.js';
import { FireGrid, Multiplier } from '../items/Effects.js';
import { Inventory, DEVICE_TYPES } from '../items/Inventory.js';
import { Renderer } from '../render/Renderer.js';
import { Assets } from '../render/Assets.js';
import { ChunkView } from '../render/ChunkView.js';
import { EntityViews } from '../render/EntityViews.js';
import { Particles } from '../render/Particles.js';
import { Input } from '../input/Input.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { AudioFx } from '../audio/Audio.js';
import { distance, toWorld, dirVector, key } from '../hex/Hex.js';

const LS_KEY = 'tombCrawler.v1';
const PICKUP_LABEL = {
  [PICKUP.BOMB]: '+Bomb', [PICKUP.INCENDIARY]: '+Incendiary', [PICKUP.SHAPED]: '+Shaped charge',
  [PICKUP.MULT2]: '×2!', [PICKUP.MULT3]: '×3!', [PICKUP.ANKH]: '+Life',
};

export class Game {
  constructor() {
    this.events = new EventBus();
    this.store = this._load();
    this.settings = Object.assign({ volume: 0.7, camera: 'perspective', touch: 'right' }, this.store.settings || {});

    this.renderer = new Renderer(document.getElementById('canvas-host'));
    this.assets = new Assets();
    this.particles = new Particles(this.renderer.scene);
    this.views = new EntityViews(this.renderer.scene, this.assets);
    this.audio = new AudioFx();
    this.hud = new Hud(this);
    this.screens = new Screens(this);
    this.input = new Input(this, this.renderer.gl.domElement);

    this.chunkViews = new Map();
    this.clock = 0;
    this.state = 'title';
    this.daily = false;

    this._bindEvents();
    this.applySettings(this.settings, false);
    this.newRun(randomSeed(), false);
    this.setState('title');

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.setState('paused');
    });

    this.loop = new Loop((dt) => this.update(dt), (dt) => this.render(dt), CONFIG.TICK_RATE);
    this.loop.start();
  }

  // ---------- persistence ----------
  _load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  }
  _save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.store)); } catch { /* ignore */ }
  }

  applySettings(s, save = true) {
    this.settings = { ...this.settings, ...s };
    this.audio.setVolume(Number(this.settings.volume));
    this.renderer.setMode(this.settings.camera === 'ortho' ? 'ortho' : 'persp');
    document.body.classList.toggle('touch-left', this.settings.touch === 'left');
    this.store.settings = this.settings;
    if (save) this._save();
  }

  // ---------- run lifecycle ----------
  newRun(seed, daily) {
    for (const v of this.chunkViews.values()) v.dispose();
    this.chunkViews.clear();
    this.views.reset();
    this.particles.clear();

    this.seed = seed;
    this.daily = daily;
    this.world = new World(seed);
    this.player = new Player(0, 0);
    this.effects = { fire: new FireGrid(), mult: new Multiplier() };
    this.inventory = new Inventory();
    this.devices = new DeviceManager(this);
    this.enemies = new EnemyManager(this);
    this.time = 0;
    this.score = 0;
    this.stats = { coins: 0, wasted: 0, kills: 0, maxDist: 0 };
    this._pc = null;
    this.updateChunks();
    this.renderer.follow(0, 0, 0, 0, 0, true);
  }

  setState(s) {
    this.state = s;
    const screen = s === 'playing' ? null : s === 'paused' ? 'pause' : s;
    this.screens.show(screen);
    this.hud.show(s !== 'title');
    if (s === 'title') this.screens.fillTitle(this.store);
  }

  action(name) {
    switch (name) {
      case 'play': this.newRun(randomSeed(), false); this.setState('playing'); break;
      case 'daily': this.newRun(dailySeed(), true); this.setState('playing'); break;
      case 'restart': this.newRun(this.daily ? dailySeed() : randomSeed(), this.daily); this.setState('playing'); break;
      case 'resume': if (this.state === 'paused') this.setState('playing'); break;
      case 'quit': this.newRun(randomSeed(), false); this.setState('title'); break;
      case 'settings': this.screens.fillSettings(this.settings); this.screens.show('settings'); break;
      case 'settings-back': this.setState(this.state); break;
    }
  }

  togglePause() {
    if (this.state === 'playing') this.setState('paused');
    else if (this.state === 'paused') this.setState('playing');
  }

  // ---------- player commands ----------
  queueDir(d) { if (this.state === 'playing') this.player.queue(d); }
  selectSlot(i) { this.inventory.select(i); }
  cycleSlot() { this.inventory.cycle(); }

  deploy() {
    if (this.state !== 'playing') return;
    const inv = this.inventory;
    let type = inv.selectedType;
    if (inv.counts[type] <= 0) {
      const i = DEVICE_TYPES.findIndex((t) => inv.counts[t] > 0);
      if (i < 0) { this.events.emit('deployFail'); return; }
      inv.select(i);
      type = inv.selectedType;
    }
    const [q, r] = this.player.logicalCell();
    if (this.devices.occupied(q, r)) { this.events.emit('deployFail'); return; }
    inv.consume(type);
    this.devices.place(type, q, r, this.player.facing);
  }

  // ---------- simulation ----------
  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;
    const p = this.player;
    p.update(dt, this.world, (q, r) => this.onPlayerEnter(q, r));
    this.enemies.update(dt);
    this.devices.update(dt);
    if (this.state !== 'playing') return;
    this.effects.fire.update(this.time);
    this.effects.mult.update(dt);

    const [lq, lr] = p.logicalCell();
    if (this.effects.fire.isBurning(lq, lr)) this.hurtPlayer('fire');
    this.checkCollisions();
    if (this.state !== 'playing') return;

    const d = distance(lq, lr, 0, 0);
    if (d > this.stats.maxDist) this.stats.maxDist = d;
    this.updateChunks();
  }

  checkCollisions() {
    const [pq, pr] = this.player.floatPos();
    const [px, pz] = toWorld(pq, pr);
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const [eq, er] = e.floatPos();
      const [ex, ez] = toWorld(eq, er);
      if (Math.hypot(ex - px, ez - pz) < CONFIG.HIT_RADIUS) { this.hurtPlayer('enemy'); break; }
    }
  }

  updateChunks() {
    const [lq, lr] = this.player.logicalCell();
    const [cq, cr] = World.chunkCoord(lq, lr);
    const k = cq + ',' + cr;
    if (k === this._pc) return;
    this._pc = k;
    const { activated, deactivated } = this.world.updateActive(cq, cr);
    for (const c of deactivated) {
      const v = this.chunkViews.get(c.key);
      if (v) { v.dispose(); this.chunkViews.delete(c.key); }
      this.enemies.onChunkDeactivated(c);
    }
    for (const c of activated) {
      const v = new ChunkView(c, this.assets);
      this.renderer.scene.add(v.group);
      this.chunkViews.set(c.key, v);
    }
  }

  onPlayerEnter(q, r) {
    const w = this.world;
    const item = w.getItem(q, r);
    if (item !== ITEM.NONE) {
      const pile = item === ITEM.PILE;
      const m = this.effects.mult.current;
      const value = (pile ? CONFIG.SCORE.pile : CONFIG.SCORE.coin) * m;
      this.score += value;
      this.stats.coins++;
      w.setItem(q, r, ITEM.NONE);
      this.events.emit('coinCollected', { q, r, value, mult: m, pile });
    }
    const pk = w.getPickup(q, r);
    if (pk !== PICKUP.NONE && this.collectPickup(pk)) {
      w.setPickup(q, r, PICKUP.NONE);
      this.events.emit('pickup', { q, r, type: pk });
    }
  }

  collectPickup(pk) {
    const inv = this.inventory;
    const addDevice = (type) => {
      if (!inv.add(type)) return false;
      if (inv.counts[inv.selectedType] <= 0) inv.select(DEVICE_TYPES.indexOf(type));
      return true;
    };
    switch (pk) {
      case PICKUP.BOMB: return addDevice('bomb');
      case PICKUP.INCENDIARY: return addDevice('incendiary');
      case PICKUP.SHAPED: return addDevice('shapedCharge');
      case PICKUP.MULT2: this.effects.mult.add(2, CONFIG.MULTIPLIERS[2]); return true;
      case PICKUP.MULT3: this.effects.mult.add(3, CONFIG.MULTIPLIERS[3]); return true;
      case PICKUP.ANKH:
        if (this.player.lives >= CONFIG.MAX_LIVES) return false;
        this.player.lives++;
        return true;
    }
    return false;
  }

  applyBlast(cells, d) {
    const w = this.world;
    const hit = new Set();
    let walls = 0;
    for (const [q, r] of cells) {
      hit.add(key(q, r));
      if (w.getType(q, r) === CELL.CRACKED) {
        w.setType(q, r, CELL.RUBBLE);
        walls++;
        this.score += CONFIG.SCORE.wall;
      } else if (w.getItem(q, r) !== ITEM.NONE) {
        w.setItem(q, r, ITEM.NONE);
        this.stats.wasted++;
      }
    }
    for (const e of [...this.enemies.list]) {
      if (!e.alive) continue;
      const [q, r] = e.logicalCell();
      if (hit.has(key(q, r))) this.killEnemy(e, 'blast');
    }
    this.events.emit('explosion', { q: d.q, r: d.r, type: d.type, cells, walls });
    const [pq, pr] = this.player.logicalCell();
    if (hit.has(key(pq, pr))) this.hurtPlayer('blast');
  }

  applyFire(cells, d) {
    const w = this.world;
    this.effects.fire.ignite(cells, this.time, CONFIG.DEVICES.incendiary.burnTime);
    for (const [q, r] of cells) {
      if (w.getItem(q, r) !== ITEM.NONE) { w.setItem(q, r, ITEM.NONE); this.stats.wasted++; }
    }
    this.events.emit('fireStarted', { q: d.q, r: d.r, cells });
  }

  killEnemy(e, cause) {
    if (!e.alive) return;
    const points = CONFIG.SCORE.enemy * this.effects.mult.current;
    this.score += points;
    this.stats.kills++;
    this.enemies.kill(e, cause, points);
  }

  hurtPlayer(cause) {
    if (this.state !== 'playing') return;
    if (!this.player.hurt()) return;
    this.events.emit('playerHit', { cause, lives: this.player.lives });
    if (this.player.lives <= 0) this.gameOver();
  }

  gameOver() {
    const bonus = this.stats.maxDist * CONFIG.SCORE.distanceBonus;
    this.score += bonus;
    const newBest = this.score > (this.store.best || 0);
    if (newBest) this.store.best = this.score;
    this.store.bestDist = Math.max(this.store.bestDist || 0, this.stats.maxDist);
    this._save();
    this.screens.fillGameOver({
      score: this.score, best: this.store.best || 0, dist: this.stats.maxDist, bonus,
      coins: this.stats.coins, wasted: this.stats.wasted, kills: this.stats.kills, newBest,
    });
    this.audio.gameOver();
    this.setState('gameover');
  }

  // ---------- events → presentation ----------
  _near(e, radius = 10) {
    const [pq, pr] = this.player.logicalCell();
    return distance(e.cq, e.cr, pq, pr) <= radius;
  }

  _bindEvents() {
    const E = this.events, A = this.audio;
    E.on('coinCollected', (c) => {
      A.coin(c.mult, c.pile);
      const [x, z] = toWorld(c.q, c.r);
      if (c.pile || c.mult > 1) this.hud.floater('+' + c.value, x, z, c.mult >= 3 ? 'x3' : c.mult >= 2 ? 'x2' : 'gold');
      this.particles.burst(x, 0.5, z, 0xffd060, c.pile ? 14 : 4, 1.5);
    });
    E.on('pickup', (p) => {
      A.pickup();
      const [x, z] = toWorld(p.q, p.r);
      const cls = p.type === PICKUP.MULT2 ? 'x2' : p.type === PICKUP.MULT3 ? 'x3' : 'pickup';
      this.hud.floater(PICKUP_LABEL[p.type] || '+', x, z, cls);
    });
    E.on('devicePlaced', () => A.place());
    E.on('fuseTick', (d) => A.tick(d.fuse < 0.5));
    E.on('deployFail', () => A.fail());
    E.on('explosion', (ev) => {
      const [x, z] = toWorld(ev.q, ev.r);
      A.boom();
      if (ev.walls) A.crumble();
      this.renderer.flash(x, z);
      this.renderer.addShake(0.6);
      for (const [q, r] of ev.cells) {
        const [cx, cz] = toWorld(q, r);
        this.particles.burst(cx, 0.4, cz, 0xff9a3a, 5, 3);
      }
      this.particles.burst(x, 0.6, z, 0xfff0c0, 30, 5);
    });
    E.on('fireStarted', (ev) => {
      const [x, z] = toWorld(ev.q, ev.r);
      A.fire();
      this.renderer.flash(x, z, 0xff6a20);
      this.renderer.addShake(0.2);
      this.particles.burst(x, 0.5, z, 0xff5a10, 25, 3);
    });
    E.on('enemyKilled', ({ enemy, points }) => {
      A.kill();
      const [fq, fr] = enemy.floatPos();
      const [x, z] = toWorld(fq, fr);
      this.hud.floater('+' + points, x, z, 'kill');
      this.particles.burst(x, 0.5, z, 0xc08040, 16, 2.5);
    });
    E.on('playerHit', () => { A.hurt(); this.hud.hurt(); this.renderer.addShake(0.5); });
    E.on('cobraHiss', ({ enemy }) => { if (this._near(enemy)) A.hiss(); });
    E.on('houndGrowl', ({ enemy }) => { if (this._near(enemy, 12)) A.growl(); });
    E.on('scarabClick', () => A.click());
  }

  // ---------- rendering ----------
  render(dt) {
    this.clock += dt;
    const t = this.clock;
    this.assets.update(t);
    for (const v of this.chunkViews.values()) v.update(t);
    this.views.sync(this, t, dt);
    this.particles.update(dt);

    const p = this.player;
    const [fq, fr] = p.floatPos();
    const [x, z] = toWorld(fq, fr);
    let dx = 0, dz = 0;
    if (p.moving && p.dir >= 0) [dx, dz] = dirVector(p.dir);
    this.renderer.follow(x, z, dx, dz, dt);
    this.renderer.setTorch(x, z, t);
    this._updateFireLight(t);
    this.hud.update();
    this.renderer.render(dt);
  }

  _updateFireLight(t) {
    const cells = this.effects.fire.cells;
    const light = this.renderer.fireLight;
    if (!cells.size) { light.intensity = 0; return; }
    let sx = 0, sz = 0, n = 0, inten = 0;
    for (const c of cells.values()) {
      const [x, z] = toWorld(c.q, c.r);
      sx += x; sz += z; n++;
      inten += this.effects.fire.intensity(c, this.time);
    }
    light.position.set(sx / n, 1.5, sz / n);
    light.intensity = 30 * Math.min(1, inten / 6) * (0.8 + 0.2 * Math.sin(t * 23));
  }
}