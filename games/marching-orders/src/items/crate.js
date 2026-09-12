/** A weapon crate sitting on a walkable cell. The first N troops over it take its contents. */
export class Crate {
  constructor(id, kind, x, y, z, capacity) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.z = z;
    this.capacity = capacity;
    this.remaining = capacity;
  }

  get depleted() {
    return this.remaining <= 0;
  }
}