import { CONFIG } from '../config.js';
import { Enemy } from './Enemy.js';
import { distance } from '../hex/Hex.js';

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawned = new Map(); // chunkKey -> Set(spawnIdx)
    this.spawnTimer = 0;
    this.clickTimer = 2;
    this.ctx = {
      world: game.world,
      fire: game.effects.fire,
      player: game.player,
      emit: (n, d) => game.events.emit(n, d),
      onEnemyEnter: (e) => this.onEnter(e),
    };
  }

  tierAt(q, r) {
    const D = CONFIG.DIFFICULTY;
    return Math.floor(distance(q, r, 0, 0) / D.tierDistance + this.game.time / D.timeTierSeconds);
  }

  speedFor(type, q, r) {
    const D = CONFIG.DIFFICULTY;
    const base = CONFIG.ENEMIES[type].speed * (1 + D.speedPerTier * this.tierAt(q, r));
    return Math.min(base, CONFIG.PLAYER_SPEED * D.speedCap);
  }

  spawn(type, q, r, opts = {}) {
    const e = new Enemy(type, q, r, this.speedFor(type, q, r), opts);
    this.list.push(e);
    return e;
  }

  trySpawns() {
    const [pq, pr] = this.game.player.logicalCell();
    for (const c of this.game.world.activeChunks()) {
      let set = this.spawned.get(c.key);
      if (!set) { set = new Set(); this.spawned.set(c.key, set); }
      c.spawns.forEach((s, i) => {
        if (set.has(i) || c.killedSpawns.has(i)) return;
        if (distance(s.q, s.r, pq, pr) < CONFIG.ENEMY_SPAWN_MIN_DIST) return;
        if (distance(s.q, s.r, 0, 0) < CONFIG.GEN.originSafeRadius) return;
        set.add(i);
        this.spawn(s.type, s.q, s.r, { home: c.key, spawnIdx: i });
      });
    }
  }

  onChunkDeactivated(chunk) {
    for (const e of this.list) if (e.home === chunk.key) e.alive = false;
    this.list = this.list.filter((e) => e.alive);
    this.spawned.delete(chunk.key);
  }

  onEnter(e) {
    if (this.game.effects.fire.isBurning(e.cq, e.cr)) this.game.killEnemy(e, 'fire');
  }

  kill(e, cause, points) {
    if (!e.alive) return;
    e.alive = false;
    const chunk = e.home ? this.game.world.chunks.get(e.home) : null;
    if (chunk && e.spawnIdx >= 0) chunk.killedSpawns.add(e.spawnIdx);
    this.game.events.emit('enemyKilled', { enemy: e, cause, points });
    if (e.type === 'swarm' && !e.small && cause === 'blast') {
      for (let k = 0; k < 2; k++) this.spawn('scarab', e.cq, e.cr, { small: true, home: e.home, wait: 0.3 + k * 0.2 });
    }
  }

  update(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.5; this.trySpawns(); }

    const fire = this.game.effects.fire;
    const [pq, pr] = this.game.player.logicalCell();
    for (const e of this.list) {
      if (!e.alive) continue;
      e.update(dt, this.ctx);
      if (!e.alive) continue;
      const [q, r] = e.logicalCell();
      if (fire.isBurning(q, r)) { this.game.killEnemy(e, 'fire'); continue; }
      if (distance(q, r, pq, pr) > CONFIG.ENEMY_DESPAWN_DIST) {
        e.alive = false; // despawn quietly; its marker can respawn later
        this.spawned.get(e.home)?.delete(e.spawnIdx);
      }
    }
    this.list = this.list.filter((e) => e.alive);

    this.clickTimer -= dt;
    if (this.clickTimer <= 0) {
      this.clickTimer = 1.5 + Math.random() * 2;
      if (this.list.some((e) => e.type === 'scarab' && distance(e.cq, e.cr, pq, pr) <= 7)) {
        this.game.events.emit('scarabClick');
      }
    }
  }
}