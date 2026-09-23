import { toWorld, dirAngle } from '../hex/Hex.js';

function lerpAngle(a, b, k) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * k;
}

// Keeps three.js objects in sync with player, enemies, devices and fire.
export class EntityViews {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.player = assets.makePlayer();
    scene.add(this.player);
    this.enemies = new Map();
    this.devices = new Map();
    this.fires = new Map();
  }

  reset() {
    for (const map of [this.enemies, this.devices, this.fires]) {
      for (const g of map.values()) this.scene.remove(g);
      map.clear();
    }
  }

  sync(game, time, dt) {
    const k = 1 - Math.exp(-dt * 14);

    // Player.
    const p = game.player;
    const [fq, fr] = p.floatPos();
    const [px, pz] = toWorld(fq, fr);
    this.player.position.set(px, p.moving ? Math.abs(Math.sin(time * 16)) * 0.05 : 0, pz);
    this.player.rotation.y = lerpAngle(this.player.rotation.y, -dirAngle(p.facing), k);
    this.player.visible = p.invuln <= 0 || Math.floor(time * 14) % 2 === 0;

    // Enemies.
    const seen = new Set();
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      seen.add(e.id);
      let g = this.enemies.get(e.id);
      if (!g) {
        g = this.assets.makeEnemy(e.type, e.small);
        if (e.dir >= 0) g.rotation.y = -dirAngle(e.dir);
        this.scene.add(g);
        this.enemies.set(e.id, g);
      }
      const [eq, er] = e.floatPos();
      const [x, z] = toWorld(eq, er);
      g.position.set(x, 0, z);
      if (e.dir >= 0) g.rotation.y = lerpAngle(g.rotation.y, -dirAngle(e.dir), k);
      this._animate(e, g, time);
    }
    for (const [id, g] of this.enemies) {
      if (!seen.has(id)) { this.scene.remove(g); this.enemies.delete(id); }
    }

    // Devices.
    const seenD = new Set();
    for (const d of game.devices.list) {
      seenD.add(d.id);
      let g = this.devices.get(d.id);
      if (!g) {
        g = this.assets.makeDevice(d.type);
        const [x, z] = toWorld(d.q, d.r);
        g.position.set(x, 0, z);
        if (d.type === 'shapedCharge') g.rotation.y = -dirAngle(d.facing);
        this.scene.add(g);
        this.devices.set(d.id, g);
      }
      const fast = d.fuse < 0.5;
      g.userData.spark.visible = Math.floor(time * (fast ? 20 : 8)) % 2 === 0;
      g.scale.setScalar(fast ? 1 + 0.12 * Math.sin(time * 40) : 1);
    }
    for (const [id, g] of this.devices) {
      if (!seenD.has(id)) { this.scene.remove(g); this.devices.delete(id); }
    }

    // Fire.
    const fire = game.effects.fire;
    for (const [key, c] of fire.cells) {
      let g = this.fires.get(key);
      if (!g) {
        g = this.assets.makeFire();
        const [x, z] = toWorld(c.q, c.r);
        g.position.set(x, 0, z);
        g.userData.phase = Math.random() * 10;
        this.scene.add(g);
        this.fires.set(key, g);
      }
      const inten = fire.intensity(c, game.time);
      const ph = g.userData.phase;
      const s = 0.35 + 0.65 * inten;
      g.scale.set(s, s * (0.85 + 0.25 * Math.sin(time * 17 + ph)), s);
      g.rotation.y = time * 0.6 + ph;
    }
    for (const [key, g] of this.fires) {
      if (!fire.cells.has(key)) { this.scene.remove(g); this.fires.delete(key); }
    }
  }

  _animate(e, g, time) {
    const ud = g.userData;
    switch (e.type) {
      case 'cobra': {
        const wind = e.state === 'windup';
        ud.hood.scale.set(1, 1, wind ? 1.7 : 1);
        ud.neck.rotation.z = wind ? -0.25 : Math.sin(time * 3 + e.id) * 0.1;
        break;
      }
      case 'hound': {
        const mat = e.state === 'hunt' ? this.assets.houndHuntMat : this.assets.houndEyeMat;
        for (const m of ud.eyes) m.material = mat;
        break;
      }
      case 'swarm': {
        for (const p of ud.parts) {
          p.m.position.set(
            p.bx + Math.sin(time * 9 + p.ph) * 0.12,
            p.by + Math.sin(time * 13 + p.ph) * 0.07,
            p.bz + Math.cos(time * 11 + p.ph) * 0.12,
          );
        }
        break;
      }
      case 'scarab':
        g.position.y = e.moving ? Math.abs(Math.sin(time * 20 + e.id)) * 0.03 : 0;
        break;
    }
  }
}