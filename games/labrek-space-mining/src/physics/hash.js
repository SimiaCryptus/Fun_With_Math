// Deterministic state hash (FNV-1a over typed-array bytes). All target
// platforms are little-endian, so byte views are consistent.

function mix(h, arr, start = 0, end = arr.length) {
  if (end <= start) return h;
  const bpe = arr.BYTES_PER_ELEMENT;
  const b = new Uint8Array(arr.buffer, arr.byteOffset + start * bpe, (end - start) * bpe);
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  return h;
}

export function hashState(world) {
  let h = 0x811c9dc5 | 0;
  const V = world.voxels, F = world.faces, Pp = world.particles;
  h = mix(h, Float64Array.of(world.tick));
  h = mix(h, world.frame.Om); h = mix(h, world.frame.qf);
  for (const c of world.clusters) {
    if (!c.alive) continue;
    h = mix(h, Float64Array.of(c.id, c.M, c.voxels.length));
    h = mix(h, c.X); h = mix(h, c.U); h = mix(h, c.q); h = mix(h, c.wb);
  }
  h = mix(h, V.alive, 0, V.hi); h = mix(h, V.cluster, 0, V.hi);
  h = mix(h, V.mass, 0, V.hi); h = mix(h, V.temp, 0, V.hi);
  h = mix(h, V.px, 0, V.hi); h = mix(h, V.py, 0, V.hi); h = mix(h, V.pz, 0, V.hi);
  h = mix(h, F.alive, 0, F.hi); h = mix(h, F.state, 0, F.hi); h = mix(h, F.dmg, 0, F.hi);
  h = mix(h, Pp.alive, 0, Pp.hi); h = mix(h, Pp.x, 0, 3 * Pp.hi); h = mix(h, Pp.u, 0, 3 * Pp.hi);
  return (h >>> 0).toString(16).padStart(8, '0');
}