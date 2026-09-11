import { clamp } from '../core/math.js';

const RESTITUTION = 0.15;
const A = {}, B = {}, R = {};

function axes(v, out) {
  const c = Math.cos(v.heading), s = Math.sin(v.heading);
  out.cx = v.x; out.cz = v.z; out.fx = c; out.fz = s; out.rx = -s; out.rz = c;
  out.hl = v.length * 0.5; out.hw = v.width * 0.5;
  return out;
}

/** 2D OBB SAT in the XZ plane. Fills R = { depth, nx, nz } (normal from A toward B). */
export function obbOverlap(a, b, out = R) {
  axes(a, A); axes(b, B);
  let minOv = Infinity, nx = 0, nz = 0;
  const dx = B.cx - A.cx, dz = B.cz - A.cz;
  for (let k = 0; k < 4; k++) {
    let ax, az;
    if (k === 0) { ax = A.fx; az = A.fz; } else if (k === 1) { ax = A.rx; az = A.rz; }
    else if (k === 2) { ax = B.fx; az = B.fz; } else { ax = B.rx; az = B.rz; }
    const pa = A.hl * Math.abs(A.fx * ax + A.fz * az) + A.hw * Math.abs(A.rx * ax + A.rz * az);
    const pb = B.hl * Math.abs(B.fx * ax + B.fz * az) + B.hw * Math.abs(B.rx * ax + B.rz * az);
    const d = dx * ax + dz * az;
    const ov = pa + pb - Math.abs(d);
    if (ov <= 0) return false;
    if (ov < minOv) { minOv = ov; const sgn = d < 0 ? -1 : 1; nx = ax * sgn; nz = az * sgn; }
  }
  out.depth = minOv; out.nx = nx; out.nz = nz;
  return true;
}

/** Distance from a point to a vehicle's OBB (0 when inside). */
export function pointDistance(v, px, pz) {
  const c = Math.cos(v.heading), s = Math.sin(v.heading);
  const dx = px - v.x, dz = pz - v.z;
  const lf = dx * c + dz * s, lr = -dx * s + dz * c;
  const ex = Math.max(0, Math.abs(lf) - v.length * 0.5);
  const ez = Math.max(0, Math.abs(lr) - v.width * 0.5);
  return Math.sqrt(ex * ex + ez * ez);
}

/** Sort-and-sweep broadphase + SAT narrowphase + impulse resolution (SPEC §10). */
export function detectCollisions(world) {
  const sorted = world._sorted;
  sorted.length = 0;
  for (const v of world.vehicles) sorted.push(v);
  sorted.sort((a, b) => (a.x - a.ext) - (b.x - b.ext));

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const aMax = a.x + a.ext;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.x - b.ext > aMax) break;
      if (Math.abs(a.z - b.z) > a.ext + b.ext) continue;
      if (obbOverlap(a, b, R)) resolve(world, a, b, R);
    }
  }

  const p = world.player;
  if (p.alive && !p.frozen) {
    const r = world.tuning.playerRadius;
    for (const v of world.vehicles) {
      if (Math.abs(v.x - p.x) > v.ext + 1 || Math.abs(v.z - p.z) > v.ext + 1) continue;
      if (pointDistance(v, p.x, p.z) < r) { world.hitPlayer(v); break; }
    }
  }
}

function resolve(world, a, b, R) {
  const { nx, nz, depth } = R;
  const m1 = a.mass, m2 = b.mass, tot = m1 + m2;
  const aW = a.state === 'wrecked', bW = b.state === 'wrecked';
  let v1x = aW ? a.wx : a.dir * a.v, v1z = aW ? a.wz : a.vz;
  let v2x = bW ? b.wx : b.dir * b.v, v2z = bW ? b.wz : b.vz;

  // positional correction, mass weighted
  a.x -= nx * depth * (m2 / tot); a.z -= nz * depth * (m2 / tot);
  b.x += nx * depth * (m1 / tot); b.z += nz * depth * (m1 / tot);

  const rvx = v2x - v1x, rvz = v2z - v1z;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return;                       // separating or resting contact
  const dv = Math.sqrt(rvx * rvx + rvz * rvz);
  const j = -(1 + RESTITUTION) * vn / (1 / m1 + 1 / m2);
  v1x -= j * nx / m1; v1z -= j * nz / m1;
  v2x += j * nx / m2; v2z += j * nz / m2;

  const severity = dv < 2 ? 'bump' : dv < 8 ? 'crash' : 'wreck';
  const cross = (b.x - a.x) * nz - (b.z - a.z) * nx;
  applyOutcome(world, a, v1x, v1z, severity, cross, dv, 1);
  applyOutcome(world, b, v2x, v2z, severity, cross, dv, -1);
  world.onCollision(a, b, dv, severity, (a.x + b.x) * 0.5, (a.z + b.z) * 0.5);
}

function applyOutcome(world, v, vx, vz, severity, cross, dv, side) {
  if (v.state === 'wrecked') { v.wx = vx; v.wz = vz; return; }
  if (severity === 'bump') {
    v.v = Math.max(0, v.dir * vx); v.vz = vz;
    if (v.driverId === 'green') v.rage = Math.min(1, v.rage + 0.4);
    if (v.driverId === 'yellow') v.panic = Math.min(1, v.panic + 0.6);
    return;
  }
  const omega = clamp(cross * 0.06 * dv, -3, 3);
  if (severity === 'wreck') vz += side * (cross >= 0 ? 1 : -1) * 1.5;   // may be pushed into an adjacent lane
  v.wreck(vx, vz, omega, world.wreckLifetime);
}