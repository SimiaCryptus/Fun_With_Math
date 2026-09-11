import * as THREE from 'three';
import { BODY_TYPES } from '../sim/vehicle.js';
import { clamp, lerp, lerpAngle } from '../core/math.js';

const CAP = 128;
// All fractions are of the body's length / height; +x is the front.
//   body:  [lengthFrac, xOffset, topFrac, widthFrac?]              lower hull (or the cargo box / bus shell)
//   cab:   [lengthFrac, xOffset, bottomFrac, topFrac, widthFrac?]  cabin (or rider), body-coloured (null = none)
//   glass: [lengthFrac, xOffset, bottomFrac, topFrac, widthFrac?]  dark window band, slightly wider/longer than the cab so it reads as glass
const SHAPE = {
   moto:   { body: [0.90,  0.00, 0.35, 0.45], cab: [0.40, -0.15, 0.35, 1.00, 0.55], glass: [0.06, 0.38, 0.50, 0.85, 0.60] },
  hatch:  { body: [1.00,  0.00, 0.55], cab: [0.50, -0.02, 0.55, 1.00], glass: [0.54, -0.02, 0.60, 0.90] },
  sedan:  { body: [1.00,  0.00, 0.50], cab: [0.50, -0.05, 0.50, 1.00], glass: [0.54, -0.05, 0.56, 0.88] },
  suv:    { body: [1.00,  0.00, 0.50], cab: [0.62, -0.02, 0.50, 1.00], glass: [0.66, -0.02, 0.56, 0.88] },
  pickup: { body: [1.00,  0.00, 0.48], cab: [0.34,  0.12, 0.48, 1.00], glass: [0.38,  0.12, 0.54, 0.90] },
  van:    { body: [1.00,  0.00, 0.55], cab: [0.85, -0.04, 0.55, 1.00], glass: [0.88, -0.04, 0.60, 0.88] },
  box:    { body: [0.66, -0.17, 1.00], cab: [0.28,  0.35, 0.00, 0.62], glass: [0.30,  0.35, 0.30, 0.55] },
  bus:    { body: [1.00,  0.00, 1.00], cab: null,                       glass: [0.96,  0.00, 0.48, 0.78] },
};
const CLEAR = 0.25;   // ground clearance

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color(), _c2 = new THREE.Color();
const COL = {
  brake: new THREE.Color(0xff2a1a), tail: new THREE.Color(0x4a0d0d), tailNight: new THREE.Color(0x9a1c1c),
  amber: new THREE.Color(0xffa826), off: new THREE.Color(0x222222),
  headDay: new THREE.Color(0xb8b09a), headNight: new THREE.Color(0xfff3c4), flash: new THREE.Color(0xffffff),
};

function makeInstanced(geo, mat, cap) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

/** Box part in body-local space: fractions of length / height, absolute width factor. */
function part(b, [lf, xo, lo, hi], wf) {
  const g = new THREE.BoxGeometry(b.length * lf, b.height * (hi - lo), b.width * wf);
  g.translate(b.length * xo, CLEAR + b.height * (lo + hi) * 0.5, 0);
  return g;
}

function flush(m) {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

/** One InstancedMesh per body type (+ cab, glass, wheels, lamps) — ≤ 22 draw calls for all traffic (SPEC §16.3). */
export class VehicleView {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.night = false;
    this.bodies = {};
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a222c });
    for (const type in BODY_TYPES) {
      const b = BODY_TYPES[type], sh = SHAPE[type];
       const [bl, bx, bh, bw = 1] = sh.body;
       const body = makeInstanced(part(b, [bl, bx, 0, bh], bw), mat, CAP);
      body.castShadow = true;
      let cab = null;
      if (sh.cab) {
         cab = makeInstanced(part(b, sh.cab, sh.cab[4] ?? 0.86), mat, CAP);
        cab.castShadow = true;
        this.group.add(cab);
      }
       const glass = makeInstanced(part(b, sh.glass, sh.glass[4] ?? (sh.cab ? 0.92 : 1.06)), glassMat, CAP);
      this.group.add(body, glass);
      this.bodies[type] = { body, cab, glass, b };
    }
    this.lights = makeInstanced(new THREE.BoxGeometry(0.14, 0.22, 0.36), new THREE.MeshBasicMaterial({ color: 0xffffff }), CAP * 4);
    const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
    wg.rotateX(Math.PI / 2);                     // axle along the vehicle's lateral axis
    this.wheels = makeInstanced(wg, new THREE.MeshLambertMaterial({ color: 0x1b1b1f }), CAP * 4);
    this.group.add(this.lights, this.wheels);
  }

  update(world, alpha, time) {
    for (const t in this.bodies) { const e = this.bodies[t]; e.body.count = 0; e.glass.count = 0; if (e.cab) e.cab.count = 0; }
    let nl = 0, nw = 0;
    const blink = Math.floor(time * 3) % 2 === 0;   // 1.5 Hz indicator / hazard

    for (const v of world.vehicles) {
      const e = this.bodies[v.bodyType];
      if (!e || e.body.count >= CAP) continue;
      const x = lerp(v.prevX, v.x, alpha), z = lerp(v.prevZ, v.z, alpha);
      const h = lerpAngle(v.prevHeading, v.heading, alpha);
      const wrecked = v.state === 'wrecked';
       const moto = v.bodyType === 'moto';
       const rollK = moto ? 0.18 : 0.05, rollMax = moto ? 0.4 : 0.1;     // bikes lean into their swerves
       const roll = wrecked ? 0 : clamp(-v.vz * rollK, -rollMax, rollMax); // body roll eases the eye into swerves
      _e.set(roll, -h, 0);
      _q.setFromEuler(_e);
      _p.set(x, 0, z);
      _m.compose(_p, _q, _s);

      const i = e.body.count++;
      e.body.setMatrixAt(i, _m);
      _c.setHex(v.color);
      if (wrecked) _c.multiplyScalar(0.45);
      e.body.setColorAt(i, _c);
      e.glass.setMatrixAt(e.glass.count++, _m);
      if (e.cab) {
        const j = e.cab.count++;
        e.cab.setMatrixAt(j, _m);
        _c2.copy(_c).multiplyScalar(0.8);
        e.cab.setColorAt(j, _c2);
      }

      const c = Math.cos(h), s = Math.sin(h), b = e.b;
      const sig = v.signals;
      const flash = sig.headlightFlash > 0 && Math.floor(sig.headlightFlash * 8) % 2 === 0;
       const hl = b.length * 0.5 - 0.08, hw = moto ? 0 : b.width * 0.5 - 0.22;
      for (let k = 0; k < 4 && nl < CAP * 4; k++) {
         if (moto && (k & 1)) continue;                                  // one lamp each end
        const lx = k < 2 ? -hl : hl, lz = (k & 1) ? hw : -hw;
        const wz = z + lx * s + lz * c;
        _p.set(x + lx * c - lz * s, CLEAR + b.height * 0.32, wz);
        _m.compose(_p, _q, _s);
        this.lights.setMatrixAt(nl, _m);
        let col;
        if (k < 2) {                                                   // rear lamps
           const side = moto ? sig.indicator : Math.sign(wz - z);
          if (sig.hazard) col = blink ? COL.amber : COL.off;
          else if (sig.indicator !== 0 && side === sig.indicator) col = blink ? COL.amber : COL.off;
          else col = sig.brake ? COL.brake : this.night ? COL.tailNight : COL.tail;
        } else col = flash ? COL.flash : this.night ? COL.headNight : COL.headDay;
        this.lights.setColorAt(nl++, col);
      }

       const wl = b.length * 0.32, ww = moto ? 0 : b.width * 0.5 - 0.1;
      for (let k = 0; k < 4 && nw < CAP * 4; k++) {
         if (moto && (k & 1)) continue;                                  // two wheels, centred
        const lx = k < 2 ? -wl : wl, lz = (k & 1) ? ww : -ww;
        _p.set(x + lx * c - lz * s, 0.34, z + lx * s + lz * c);
        _m.compose(_p, _q, _s);
        this.wheels.setMatrixAt(nw++, _m);
      }
    }

    for (const t in this.bodies) { const e = this.bodies[t]; flush(e.body); flush(e.glass); if (e.cab) flush(e.cab); }
    this.lights.count = nl; flush(this.lights);
    this.wheels.count = nw; flush(this.wheels);
  }
}