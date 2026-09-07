import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _min = [0, 0, 0];
const _max = [0, 0, 0];
const _dims = [0, 0, 0];
const _o = [0, 0, 0];
const _d = [0, 0, 0];
const _cell = [0, 0, 0];
const _step = [0, 0, 0];
const _tMax = [0, 0, 0];
const _tDelta = [0, 0, 0];

/** Screen-space pick: NDC -> ray -> voxel DDA through the play volume. */
export function pick(camera, ndc, grid, targetable, out = {}) {
  _ray.setFromCamera(ndc, camera);
  return pickRay(_ray.ray.origin, _ray.ray.direction, grid, targetable, out);
}

/**
 * Amanatides–Woo voxel traversal against a single AABB — no per-instance raycasts.
 * Returns { cell, x, y, z, nx, ny, nz } for the first cell where targetable(cell) is true.
 */
export function pickRay(origin, dir, grid, targetable, out = {}) {
  _min[0] = -grid.width / 2; _min[1] = 0; _min[2] = -grid.depth / 2;
  _max[0] = grid.width / 2; _max[1] = grid.height; _max[2] = grid.depth / 2;
  _dims[0] = grid.width; _dims[1] = grid.height; _dims[2] = grid.depth;
  _o[0] = origin.x; _o[1] = origin.y; _o[2] = origin.z;
  _d[0] = dir.x; _d[1] = dir.y; _d[2] = dir.z;

  let tmin = -Infinity;
  let tmax = Infinity;
  let entryAxis = -1;
  let entrySign = 0;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(_d[a]) < 1e-12) {
      if (_o[a] < _min[a] || _o[a] > _max[a]) return null;
      continue;
    }
    let t1 = (_min[a] - _o[a]) / _d[a];
    let t2 = (_max[a] - _o[a]) / _d[a];
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      entryAxis = a;
      entrySign = sign;
    }
    if (t2 < tmax) tmax = t2;
  }
  if (tmax < Math.max(tmin, 0)) return null;

  const tStart = Math.max(tmin, 0) + 1e-6;
  for (let a = 0; a < 3; a++) {
    const p = _o[a] + _d[a] * tStart;
    _cell[a] = Math.min(_dims[a] - 1, Math.max(0, Math.floor(p - _min[a])));
    _step[a] = _d[a] > 0 ? 1 : _d[a] < 0 ? -1 : 0;
    if (_step[a] === 0) {
      _tMax[a] = Infinity;
      _tDelta[a] = Infinity;
    } else {
      const next = _min[a] + _cell[a] + (_step[a] > 0 ? 1 : 0);
      _tMax[a] = (next - _o[a]) / _d[a];
      _tDelta[a] = Math.abs(1 / _d[a]);
    }
  }

  let nAxis = tmin < 0 ? -1 : entryAxis; // started inside the volume: no entry face
  let nSign = entrySign;
  const maxSteps = _dims[0] + _dims[1] + _dims[2] + 3;
  for (let s = 0; s < maxSteps; s++) {
    const i = grid.index(_cell[0], _cell[1], _cell[2]);
    if (targetable(i)) {
      out.cell = i;
      out.x = _cell[0]; out.y = _cell[1]; out.z = _cell[2];
      out.nx = nAxis === 0 ? nSign : 0;
      out.ny = nAxis === 1 ? nSign : 0;
      out.nz = nAxis === 2 ? nSign : 0;
      return out;
    }
    let a = 0;
    if (_tMax[1] < _tMax[a]) a = 1;
    if (_tMax[2] < _tMax[a]) a = 2;
    _cell[a] += _step[a];
    _tMax[a] += _tDelta[a];
    nAxis = a;
    nSign = -_step[a];
    if (_cell[a] < 0 || _cell[a] >= _dims[a]) return null;
  }
  return null;
}