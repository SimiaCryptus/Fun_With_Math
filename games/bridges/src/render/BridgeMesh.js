import * as THREE from 'three';

/** Arched overpasses for chords that won a crossing conflict. */
export class BridgeMesh extends THREE.Group {
  constructor(board, theme, height) {
    super();
    // `scale` is Object3D's read-only Vector3 — don't shadow it (same fix as BoardMesh)
    this.boardScale = board.scale;
    this.board = board;
    this.height = height;
    this.mats = theme.players.map(c => new THREE.MeshStandardMaterial({
      color: new THREE.Color(c), roughness: 0.35, metalness: 0.55,
    }));
    this.cutMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
  }

  addBridge(b) {
    const ch = this.board.chords[b.over];
    if (!ch) return;
    const A = this.board.cells[ch.a].centroid, B = this.board.cells[ch.b].centroid;
    const V = this.board.vertices[ch.vertexId].p;
    const h = this.height, s = this.boardScale;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(A[0], h * 0.9, -A[1]),
      new THREE.Vector3(V[0], h + 0.4 * s, -V[1]),
      new THREE.Vector3(B[0], h * 0.9, -B[1]),
    ], false, 'catmullrom', 0.5);
    const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.07 * s, 8, false), this.mats[b.owner] ?? this.mats[0]);
    arch.userData = b;
    this.add(arch);
    // severance decal: a dark disc under the arch marks the cut path
    const cut = new THREE.Mesh(new THREE.CircleGeometry(0.14 * s, 16), this.cutMat);
    cut.rotation.x = -Math.PI / 2;
    cut.position.set(V[0], h + 0.002, -V[1]);
    this.add(cut);
  }

  reset() {
    for (const m of this.children) m.geometry.dispose();
    this.clear();
  }

  sync(bridges) {
    this.reset();
    for (const b of bridges) this.addBridge(b);
  }
}