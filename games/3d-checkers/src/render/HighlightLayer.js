import * as THREE from 'three';

const COLORS = { move: new THREE.Color(0x5cff9a), capture: new THREE.Color(0xffb347), final: new THREE.Color(0xa8ffd0) };
const LIFT = -0.3;
const MAX_MARKERS = 256;

function arcPoints(a, b, out) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += 0.35 + Math.abs(b.y - a.y) * 0.35 + a.distanceTo(b) * 0.12;
  out.push(...new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(14));
}

export class HighlightLayer {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const ring = new THREE.TorusGeometry(0.3, 0.045, 10, 32);
    ring.rotateX(Math.PI / 2);
    this.markers = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_MARKERS);
    // Solid, slightly larger pads under each ring. These are the click targets for
    // destinations — the lattice voxels themselves are deliberately not pickable
    // because they occlude each other far too much in the compact view.
    const pad = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 32);
    this.pads = new THREE.InstancedMesh(
      pad,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }),
      MAX_MARKERS,
    );
    this.pads.userData.cells = new Int16Array(MAX_MARKERS);
    for (let i = 0; i < MAX_MARKERS; i++) {
      this.markers.setColorAt(i, COLORS.move);
      this.pads.setColorAt(i, COLORS.move);
    }
    this.markers.count = 0;
    this.pads.count = 0;
    this.group.add(this.markers, this.pads);
    this.lines = [];
    this.lastLine = null;
    this._m = new THREE.Matrix4();
  }

  /** Meshes the Picker may raycast against (destination pads). */
  get pickables() { return [this.pads]; }
  cellOf(mesh, instanceId) { return mesh.userData.cells[instanceId]; }

  addLine(points, color, opacity) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    this.group.add(line);
    return line;
  }

  showCandidates(cands, chainLen, posOf) {
    this.clear();
    const seen = new Map();
    for (const c of cands) {
      const kind = c.captured.length ? 'capture' : 'move';
      const next = c.path[chainLen];
      if (!seen.has(next)) seen.set(next, kind);
      if (c.to !== next && !seen.has(c.to)) seen.set(c.to, 'final');
      const pts = [];
      for (let i = chainLen; i < c.path.length; i++) {
        const a = posOf(c.path[i - 1]); a.y += LIFT;
        const b = posOf(c.path[i]); b.y += LIFT;
        arcPoints(a, b, pts);
      }
      if (pts.length) this.lines.push(this.addLine(pts, COLORS[kind], 0.9));
    }
    let n = 0;
    for (const [idx, kind] of seen) {
      if (n >= MAX_MARKERS) break;
      const p = posOf(idx); p.y -= 0.36;
      this._m.makeTranslation(p.x, p.y, p.z);
      this.markers.setMatrixAt(n, this._m);
      this.pads.setMatrixAt(n, this._m);
      this.markers.setColorAt(n, COLORS[kind]);
      this.pads.setColorAt(n, COLORS[kind]);
      this.pads.userData.cells[n] = idx;
      n++;
    }
    this.markers.count = n;
    this.pads.count = n;
    this.markers.instanceMatrix.needsUpdate = true;
    this.markers.instanceColor.needsUpdate = true;
    this.pads.instanceMatrix.needsUpdate = true;
    this.pads.instanceColor.needsUpdate = true;
    // Refresh the cached bounding spheres (see PieceView.update) so the destination
    // pads are actually raycast-able wherever they end up in the lattice.
    this.markers.computeBoundingSphere();
    this.pads.computeBoundingSphere();
  }

  setLastMove(move, posOf) {
    this.clearLastMove();
    if (!move) return;
    const pts = [];
    for (let i = 1; i < move.path.length; i++) {
      const a = posOf(move.path[i - 1]); a.y += LIFT;
      const b = posOf(move.path[i]); b.y += LIFT;
      arcPoints(a, b, pts);
    }
    this.lastLine = this.addLine(pts, 0x6fa8ff, 0.6);
  }

  clearLastMove() {
    if (!this.lastLine) return;
    this.group.remove(this.lastLine);
    this.lastLine.geometry.dispose();
    this.lastLine.material.dispose();
    this.lastLine = null;
  }

  clear() {
    for (const l of this.lines) { this.group.remove(l); l.geometry.dispose(); l.material.dispose(); }
    this.lines = [];
    this.markers.count = 0;
    this.pads.count = 0;
  }

  clearAll() { this.clear(); this.clearLastMove(); }
}