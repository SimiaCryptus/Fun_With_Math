import * as THREE from 'three';

const COLOR_A = 0x33ccff;
const COLOR_B = 0xff9933;

function buildPortalObject(p) {
  const isA = p.linkId == null || p.id < p.linkId;
  const color = isA ? COLOR_A : COLOR_B;
  const group = new THREE.Group();

  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.015, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.5, color, 0.12, 0.08);
  group.add(disk, rim, arrow);

  group.scale.setScalar(p.radius);
  group.position.set(p.center.x, p.center.y, p.center.z);
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(p.right.x, p.right.y, p.right.z),
    new THREE.Vector3(p.up.x, p.up.y, p.up.z),
    new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z),
  );
  group.quaternion.setFromRotationMatrix(m);
  return group;
}

export class PortalMeshes {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  sync(portals) {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    for (const p of portals) this.group.add(buildPortalObject(p));
  }
}