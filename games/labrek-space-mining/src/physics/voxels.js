// SoA voxel pool (physics.md §B.2). Free-list backed; ids are recycled LIFO (deterministic).

export function packKey(kx, ky, kz) {
  const cx = kx < -512 ? -512 : (kx > 511 ? 511 : kx);
  const cy = ky < -512 ? -512 : (ky > 511 ? 511 : ky);
  const cz = kz < -512 ? -512 : (kz > 511 ? 511 : kz);
  return ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512);
}

export function createVoxelPool(cap) {
  return {
    cap, hi: 0, count: 0, free: [],
    alive: new Uint8Array(cap),
    cluster: new Int32Array(cap).fill(-1),
    slot: new Int32Array(cap),
    kx: new Int16Array(cap), ky: new Int16Array(cap), kz: new Int16Array(cap),
    // body-frame position relative to the cluster lattice origin (Float64 so merged,
    // rotated parts keep exact geometry)
    px: new Float64Array(cap), py: new Float64Array(cap), pz: new Float64Array(cap),
    mat: new Uint8Array(cap),
    fill: new Float64Array(cap),
    mass: new Float64Array(cap),
    temp: new Float64Array(cap),
    vol: new Float64Array(cap),
    damage: new Float32Array(cap),
    module: new Int32Array(cap).fill(-1),
    nextOcc: new Int32Array(cap).fill(-1),
    fext: new Float64Array(3 * cap),     // external force this step (frame)
    fcon: new Float64Array(3 * cap),     // contact force this step (frame)
    fjet: new Float64Array(3 * cap),     // sublimation jet force (frame), refreshed by thermal
    thrust: new Float64Array(3 * cap),   // persistent body-frame thrust
    extMark: new Uint8Array(cap),
    conMark: new Uint8Array(cap),
    heat: new Float64Array(cap),         // pending heat (J), applied at thermal update
    qmod: new Float64Array(cap),         // module heat (W)
  };
}

export function allocVoxel(pool) {
  let v;
  if (pool.free.length) v = pool.free.pop();
  else { if (pool.hi >= pool.cap) throw new Error('voxel pool full'); v = pool.hi++; }
  pool.alive[v] = 1; pool.count++;
  pool.cluster[v] = -1; pool.fill[v] = 1; pool.mass[v] = 0; pool.temp[v] = 0; pool.vol[v] = 0;
  pool.damage[v] = 0; pool.module[v] = -1; pool.nextOcc[v] = -1; pool.heat[v] = 0; pool.qmod[v] = 0;
  for (let k = 0; k < 3; k++) { pool.fext[3 * v + k] = 0; pool.fcon[3 * v + k] = 0; pool.fjet[3 * v + k] = 0; pool.thrust[3 * v + k] = 0; }
  return v;
}

export function freeVoxel(pool, v) {
  if (!pool.alive[v]) return;
  pool.alive[v] = 0; pool.cluster[v] = -1; pool.count--; pool.mass[v] = 0; pool.heat[v] = 0; pool.qmod[v] = 0;
  for (let k = 0; k < 3; k++) { pool.thrust[3 * v + k] = 0; pool.fjet[3 * v + k] = 0; }
  pool.free.push(v);
}