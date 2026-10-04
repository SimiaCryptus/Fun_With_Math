// Test scene builders (physics.md §B.5): worlds built directly from voxel lists.
import { createWorld } from '../../world.js';
import { createCluster, addVoxel, recomputeMassProps } from '../../clusters.js';
import { MAT } from '../../materials.js';
import { v3 } from '../../math.js';

export function testWorld(over = {}) {
  return createWorld({ vcap: 4096, fcap: 16, particleCap: 256, ...over });
}

export function box(world, nx, ny, nz, mat = MAT.SIL, fill = 1) {
  const c = createCluster(world);
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) addVoxel(world, c, x, y, z, mat, fill);
  recomputeMassProps(world, c, true);
  return c;
}

// set U so the inertial velocity (frame axes) is W
export function setInertialVelocity(world, c, W) {
  const t = v3.cross(v3.create(), world.frame.Om, c.X);
  v3.sub(c.U, W, t);
}