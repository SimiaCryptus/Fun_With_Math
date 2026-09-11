import * as THREE from 'three';

const ROW_COLORS = { verge: 0x4d8a3c, shoulder: 0x6f6f6a, lane: 0x4b4d55, median: 0x4d8a3c, curb: 0xc9c465 };

/** Road rows, lane markings, goal trees / hollows (SPEC §16.2). */
export class RoadView {
  constructor(scene, road, tuning) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshLambertMaterial({ color: 0x2f5d2a }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, road.zMin / 2); ground.receiveShadow = true;
    this.group.add(ground);

    for (const row of road.rows) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(260, row.depth), new THREE.MeshLambertMaterial({ color: ROW_COLORS[row.type] }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0, row.zCenter); m.receiveShadow = true;
      this.group.add(m);
    }

    const dashes = [], solids = [];
    for (let i = 0; i < road.rows.length - 1; i++) {
      const a = road.rows[i], b = road.rows[i + 1], z = a.zMin;
      if (a.lane && b.lane) {
        if (a.lane.dir === b.lane.dir) dashes.push(z);
        else { solids.push({ z: z + 0.12, c: 0xf2c724 }); solids.push({ z: z - 0.12, c: 0xf2c724 }); }
      } else if (a.lane || b.lane) solids.push({ z, c: 0xe8e8e0 });
    }
    const nDash = 30;
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.15), new THREE.MeshBasicMaterial({ color: 0xe8e8e0 }), Math.max(1, dashes.length * nDash));
    const dummy = new THREE.Object3D();
    let k = 0;
    for (const z of dashes) for (let j = 0; j < nDash; j++) {
      dummy.position.set(-130 + j * 9 + 1.5, 0.01, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(k++, dummy.matrix);
    }
    inst.count = k; inst.frustumCulled = false;
    this.group.add(inst);
    for (const s of solids) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(260, 0.02, 0.15), new THREE.MeshBasicMaterial({ color: s.c }));
      m.position.set(0, 0.01, s.z);
      this.group.add(m);
    }

    this.hollowMeshes = [];
    const goal = road.goalRow;
    if (goal) {
      for (const x of tuning.hollowXs) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 8), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
        trunk.position.set(x, 1.3, goal.zCenter - 0.6); trunk.castShadow = true;
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3f8f3f }));
        crown.position.set(x, 3.3, goal.zCenter - 0.6); crown.castShadow = true;
        const hole = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshLambertMaterial({ color: 0x1a1008 }));
        hole.position.set(x, 1.4, goal.zCenter + 0.05);
        this.group.add(trunk, crown, hole);
        this.hollowMeshes.push(hole);
      }
    }
  }

  update(world) {
    for (let i = 0; i < this.hollowMeshes.length; i++) {
      const h = world.hollows[i];
      this.hollowMeshes[i].material.color.setHex(h && h.filled ? 0xc97a3a : 0x1a1008);
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); if (o.material?.dispose) o.material.dispose(); });
  }
}