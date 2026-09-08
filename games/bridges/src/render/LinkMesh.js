import * as THREE from 'three';

/**
 * Physical "links": short bars welded between the centroids of cells that
 * are actually connected for their owner (edge adjacency or a live chord).
 * One shared unit cylinder, scaled/oriented per link.
 */
export class LinkMesh extends THREE.Group {
  constructor(board, theme, height) {
    super();
    // `scale` is Object3D's read-only Vector3 — don't shadow it (same fix as BoardMesh)
    this.board = board;
    this.boardScale = board.scale;
    this.height = height;
    this.radius = 0.07 * board.scale;
    this.y = height * 1.35;            // flush with the raised top of a claimed cell
    this.geo = new THREE.CylinderGeometry(this.radius, this.radius, 1, 10);
    this.mats = theme.players.map(c => new THREE.MeshStandardMaterial({
      color: new THREE.Color(c), roughness: 0.3, metalness: 0.5,
    }));
    this.keys = new Set();
    this._up = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
  }

  addLink(a, b, owner) {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (this.keys.has(key)) return;
    const A = this.board.cells[a]?.centroid, B = this.board.cells[b]?.centroid;
    if (!A || !B) return;
    this.keys.add(key);
    const dx = B[0] - A[0], dz = -(B[1] - A[1]);
    const len = Math.hypot(dx, dz) || 1e-6;
    const mesh = new THREE.Mesh(this.geo, this.mats[owner] ?? this.mats[0]);
    mesh.position.set((A[0] + B[0]) / 2, this.y, -(A[1] + B[1]) / 2);
    mesh.quaternion.setFromUnitVectors(this._up, this._dir.set(dx / len, 0, dz / len));
    mesh.scale.set(1, len, 1);
    mesh.userData = { a, b, owner };
    this.add(mesh);
  }

  reset() { this.clear(); this.keys.clear(); }

  sync(links) {
    this.reset();
    for (const [a, b, o] of links) this.addLink(a, b, o);
  }

  dispose() {
    this.reset();
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
  }
}