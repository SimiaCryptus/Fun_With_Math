import * as THREE from 'three';

const CAP_ITEMS = 16, PUFFS = 6, CAP_PUFFS = 8 * PUFFS;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _e = new THREE.Euler();

function makeInstanced(geo, mat, cap) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

/** Acorns and smoke bombs lying on the road, plus lit smoke plumes (SPEC §11.7). */
export class ItemView {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const nut = new THREE.SphereGeometry(0.22, 10, 8);
    nut.scale(1, 1.25, 1); nut.translate(0, 0.3, 0);
    this.acorns = makeInstanced(nut, new THREE.MeshLambertMaterial({ color: 0xa8692e }), CAP_ITEMS);
    this.acorns.castShadow = true;
    const cap = new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(0, 0.42, 0);
    this.caps = makeInstanced(cap, new THREE.MeshLambertMaterial({ color: 0x5a3a1e }), CAP_ITEMS);
     // smoke bomb: dark sphere with a stubby orange fuse — unmistakably not an acorn
     const bomb = new THREE.SphereGeometry(0.26, 10, 8);
     bomb.translate(0, 0.28, 0);
     this.bombs = makeInstanced(bomb, new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), CAP_ITEMS);
     this.bombs.castShadow = true;
     const fuse = new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6);
     fuse.rotateZ(0.5); fuse.translate(0.06, 0.6, 0);
     this.fuses = makeInstanced(fuse, new THREE.MeshLambertMaterial({ color: 0xd88a2a }), CAP_ITEMS);
    this.puffs = makeInstanced(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.55, depthWrite: false }),
      CAP_PUFFS,
    );
     this.group.add(this.acorns, this.caps, this.bombs, this.fuses, this.puffs);
  }

  update(world, time) {
    const items = world.items, R = world.tuning.smokeRadius;
     let n = 0, nb = 0;
    for (const it of items.list) {
       const isBomb = it.kind === 'smoke';
       if (isBomb ? nb >= CAP_ITEMS : n >= CAP_ITEMS) continue;
      const blink = it.timer < 3 && Math.floor(time * 6) % 2 === 1;   // about to vanish
      _p.set(it.x, 0.05 * Math.sin(time * 3 + it.id), it.z);
      _e.set(0.15, it.id * 0.7, 0);
      _q.setFromEuler(_e);
      _s.setScalar(blink ? 0.55 : 1);
      _m.compose(_p, _q, _s);
       if (isBomb) { this.bombs.setMatrixAt(nb, _m); this.fuses.setMatrixAt(nb, _m); nb++; }
       else { this.acorns.setMatrixAt(n, _m); this.caps.setMatrixAt(n, _m); n++; }
    }
    this.acorns.count = n; this.acorns.instanceMatrix.needsUpdate = true;
    this.caps.count = n; this.caps.instanceMatrix.needsUpdate = true;
     this.bombs.count = nb; this.bombs.instanceMatrix.needsUpdate = true;
     this.fuses.count = nb; this.fuses.instanceMatrix.needsUpdate = true;

    let k = 0;
    _q.identity();
    for (const s of items.smokes) {
      const age = s.total - s.timer;
      const grow = Math.min(1, age / 1.2), fade = Math.min(1, s.timer / 1.5);
      for (let j = 0; j < PUFFS && k < CAP_PUFFS; j++) {
        const ang = j * 2.4 + time * 0.25;
        const r = R * 0.45 * grow * (0.5 + 0.5 * ((j * 7) % 5) / 4);
        const y = 0.6 + grow * (0.9 + 0.7 * ((j * 3) % 4) / 3) + 0.15 * Math.sin(time * 1.7 + j);
        _p.set(s.x + Math.cos(ang) * r, y, s.z + Math.sin(ang) * r);
        _s.setScalar(Math.max(0.01, R * 0.4 * grow * fade * (0.7 + 0.3 * ((j * 5) % 3) / 2)));
        _m.compose(_p, _q, _s);
        this.puffs.setMatrixAt(k++, _m);
      }
    }
    this.puffs.count = k; this.puffs.instanceMatrix.needsUpdate = true;
  }
}