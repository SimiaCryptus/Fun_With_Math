import { VOXEL, isSolid } from './voxel.js';

export const CHUNK_SIZE = 16;

export function chunkKey(cx, cy, cz) {
  return `${cx},${cy},${cz}`;
}

export function parseChunkKey(key) {
  return key.split(',').map(Number);
}

/** Dense voxel grid with dirty-chunk tracking for the renderer. */
export class World {
  constructor(w, h, d) {
    this.w = w;
    this.h = h;
    this.d = d;
    this.data = new Uint8Array(w * h * d);
    this.chunks = [Math.ceil(w / CHUNK_SIZE), Math.ceil(h / CHUNK_SIZE), Math.ceil(d / CHUNK_SIZE)];
    this.dirty = new Set();
    this.markAllDirty();
  }

  inBounds(x, y, z) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h && z >= 0 && z < this.d;
  }

  index(x, y, z) {
    return (y * this.d + z) * this.w + x;
  }

  /** Above the world is open sky; every other side behaves like an unbreakable wall/floor. */
  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return y >= this.h ? VOXEL.AIR : VOXEL.BEDROCK;
    return this.data[this.index(x, y, z)];
  }

  isSolid(x, y, z) {
    return isSolid(this.get(x, y, z));
  }

  set(x, y, z, type) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    if (this.data[i] === type) return false;
    this.data[i] = type;
    this.markDirty(x, y, z);
    return true;
  }

  fill(from, to, type) {
    const [x0, y0, z0] = from;
    const [x1, y1, z1] = to;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          this.set(x, y, z, type);
        }
      }
    }
  }
   /** Copy of this world with new dimensions; overlapping voxels are preserved. */
   resized(w, h, d) {
     const next = new World(w, h, d);
     const mw = Math.min(w, this.w), mh = Math.min(h, this.h), md = Math.min(d, this.d);
     for (let y = 0; y < mh; y++) {
       for (let z = 0; z < md; z++) {
         for (let x = 0; x < mw; x++) {
           next.data[next.index(x, y, z)] = this.data[this.index(x, y, z)];
         }
       }
     }
     return next;
   }

  markDirty(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE), cy = Math.floor(y / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const add = (a, b, c) => {
      if (a >= 0 && a < this.chunks[0] && b >= 0 && b < this.chunks[1] && c >= 0 && c < this.chunks[2]) {
        this.dirty.add(chunkKey(a, b, c));
      }
    };
    add(cx, cy, cz);
    // Neighbouring chunks share culled faces across the border.
    const lx = x % CHUNK_SIZE, ly = y % CHUNK_SIZE, lz = z % CHUNK_SIZE;
    if (lx === 0) add(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) add(cx + 1, cy, cz);
    if (ly === 0) add(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) add(cx, cy + 1, cz);
    if (lz === 0) add(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) add(cx, cy, cz + 1);
  }

  markAllDirty() {
    for (let cx = 0; cx < this.chunks[0]; cx++) {
      for (let cy = 0; cy < this.chunks[1]; cy++) {
        for (let cz = 0; cz < this.chunks[2]; cz++) this.dirty.add(chunkKey(cx, cy, cz));
      }
    }
  }

  consumeDirty() {
    const keys = Array.from(this.dirty);
    this.dirty.clear();
    return keys;
  }
}