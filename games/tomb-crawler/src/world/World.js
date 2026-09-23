import { CONFIG } from '../config.js';
import { Chunk, isWalkableType } from './Chunk.js';
import { buildChunk } from './Populator.js';

const S = CONFIG.CHUNK_SIZE;

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.activeKeys = new Set();
    this._last = null;
  }

  static chunkCoord(q, r) { return [Math.floor(q / S), Math.floor(r / S)]; }

  getChunk(cq, cr) {
    const k = cq + ',' + cr;
    let c = this.chunks.get(k);
    if (!c) { c = new Chunk(cq, cr); this.chunks.set(k, c); }
    if (!c.data) c.load(buildChunk(this.seed, cq, cr));
    return c;
  }

  chunkAt(q, r) {
    const cq = Math.floor(q / S), cr = Math.floor(r / S);
    const last = this._last;
    if (last && last.data && last.cq === cq && last.cr === cr) return last;
    const c = this.getChunk(cq, cr);
    this._last = c;
    return c;
  }

  getType(q, r) { const c = this.chunkAt(q, r); return c.data.type[c.localIndex(q, r)]; }
  isWalkable(q, r) { return isWalkableType(this.getType(q, r)); }
  getItem(q, r) { const c = this.chunkAt(q, r); return c.data.item[c.localIndex(q, r)]; }
  getPickup(q, r) { const c = this.chunkAt(q, r); return c.data.pickup[c.localIndex(q, r)]; }
  setType(q, r, t) { const c = this.chunkAt(q, r); c.setType(c.localIndex(q, r), t); }
  setItem(q, r, v) { const c = this.chunkAt(q, r); c.setItem(c.localIndex(q, r), v); }
  setPickup(q, r, v) { const c = this.chunkAt(q, r); c.setPickup(c.localIndex(q, r), v); }

  // Activates chunks around the player's chunk; returns which changed state.
  updateActive(pcq, pcr) {
    const V = CONFIG.VIEW_CHUNK_RADIUS, K = CONFIG.KEEP_CHUNK_RADIUS;
    const want = new Set();
    const activated = [], deactivated = [];
    for (let dq = -V; dq <= V; dq++) {
      for (let dr = -V; dr <= V; dr++) {
        const c = this.getChunk(pcq + dq, pcr + dr);
        want.add(c.key);
        if (!c.viewActive) { c.viewActive = true; c.changes.length = 0; activated.push(c); }
      }
    }
    for (const k of this.activeKeys) {
      if (want.has(k)) continue;
      const c = this.chunks.get(k);
      c.viewActive = false;
      c.changes.length = 0;
      deactivated.push(c);
    }
    this.activeKeys = want;
    for (const c of this.chunks.values()) {
      if (c.data && (Math.abs(c.cq - pcq) > K || Math.abs(c.cr - pcr) > K)) c.unload();
    }
    return { activated, deactivated };
  }

  activeChunks() {
    const out = [];
    for (const k of this.activeKeys) out.push(this.chunks.get(k));
    return out;
  }
}