// Stage 5a (problem.md §6.6): three.js viewer. One material per channel, x‑ray, Z clipping plane,
// validator overlays, click‑to‑select, glTF export. Z is up (print orientation).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1316);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(200, -220, 160);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.target.set(0, 0, 40);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x28323c, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(150, -200, 300);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.4); fill.position.set(-200, 150, 100);
    this.scene.add(key, fill);
    const grid = new THREE.GridHelper(400, 40, 0x2a323a, 0x1a2027);
    grid.rotation.x = Math.PI / 2; grid.position.z = -0.05;
    this.scene.add(grid);

    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6);   // keeps z ≤ constant
    this.model = new THREE.Group(); this.overlays = new THREE.Group();
    this.scene.add(this.model, this.overlays);
    this.tubes = new Map(); this.parts = new Map(); this.overlayObjs = new Map();
    this.xray = false; this.selected = null;
    this.raycaster = new THREE.Raycaster();

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.renderer.setAnimationLoop(() => { this.controls.update(); this.renderer.render(this.scene, this.camera); });
  }

  resize() {
    const w = this.canvas.parentElement.clientWidth || 1, h = this.canvas.parentElement.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _material(colour) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour), roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
      clippingPlanes: [this.clipPlane], transparent: this.xray, opacity: this.xray ? 0.35 : 1, depthWrite: !this.xray,
    });
  }
  _geometry(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    g.computeVertexNormals();
    return g;
  }
  _clear(group) {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    group.clear();
  }

  setModel(meshes) {
    this._clear(this.model); this.tubes.clear(); this.parts.clear();
    for (const t of meshes.tubes) {
      const mesh = new THREE.Mesh(this._geometry(t), this._material(t.colour));
      mesh.userData = { id: t.id, kind: 'tube' };
      this.model.add(mesh); this.tubes.set(t.id, mesh);
    }
    for (const part of [meshes.plate, meshes.frame]) {
      if (!part) continue;
      const mesh = new THREE.Mesh(this._geometry(part), this._material(part.colour));
      mesh.userData = { id: part.id, kind: part.kind };
      this.model.add(mesh); this.parts.set(part.kind, mesh);
    }
    this.highlight(this.selected);
  }

  setVisible(id, v) { const m = this.tubes.get(id); if (m) m.visible = v; }
  setPartVisible(kind, v) { const m = this.parts.get(kind); if (m) m.visible = v; }
  setColour(id, colour) { const m = this.tubes.get(id); if (m) m.material.color.set(colour); }
  setXray(v) {
    this.xray = v;
    for (const m of [...this.tubes.values(), ...this.parts.values()]) {
      m.material.transparent = v; m.material.opacity = v ? 0.35 : 1; m.material.depthWrite = !v; m.material.needsUpdate = true;
    }
  }
  /** fraction ∈ [0,1] of [zMin, zMax]; 1 → no clipping */
  setClip(fraction, zMin, zMax) { this.clipPlane.constant = fraction >= 0.999 ? 1e6 : zMin + (zMax - zMin) * fraction; }
  highlight(id) {
    this.selected = id;
    for (const [tid, m] of this.tubes) m.material.emissive.set(tid === id ? 0x3a3a3a : 0x000000);
  }

  // ---- overlays -------------------------------------------------------------------------------
  setOverlays(report, flags, spec) {
    this._clear(this.overlays); this.overlayObjs.clear();
    const add = (name, obj) => { obj.visible = !!flags[name]; this.overlays.add(obj); this.overlayObjs.set(name, obj); };
    add('clearance', spheres(report.clearanceViolations.map((v) => v.p), 0xff5a5a, 1.0));
    add('bend', spheres(report.bendViolations.map((v) => v.p), 0xf06ac8, 0.5));
    add('overhang', lines(report.overhangRuns, 0xffb347));
    add('drain', spheres(report.drainMinima.map((d) => d.p), 0x3aa0ff, 0.9));
    add('roots', points(report.rootAccess ? report.rootAccess.unreachable : [], report.rootAccess ? report.rootAccess.voxel : 1));
    add('box', boxEdges(spec));
  }
  setOverlay(name, v) { const o = this.overlayObjs.get(name); if (o) o.visible = v; }

  // ---- interaction ----------------------------------------------------------------------------
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.tubes.values()].filter((m) => m.visible), false);
    for (const h of hits) if (this.clipPlane.constant >= 1e5 || h.point.z <= this.clipPlane.constant) return h.object.userData.id;
    return null;
  }
  fit(bbox) {
    if (!bbox || !Number.isFinite(bbox.size[0])) return;
    const c = new THREE.Vector3(...bbox.min).add(new THREE.Vector3(...bbox.max)).multiplyScalar(0.5);
    const r = Math.max(10, Math.hypot(...bbox.size) / 2);
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(new THREE.Vector3(1, -1.1, 0.8).normalize(), r * 2.4);
    this.camera.near = Math.max(0.1, r / 100); this.camera.far = r * 30;
    this.camera.updateProjectionMatrix();
  }
  async exportGLB() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    return new Promise((resolve, reject) => new GLTFExporter().parse(this.model, resolve, reject, { binary: true }));
  }
}

// ---- overlay builders -----------------------------------------------------------------------------
function spheres(pts, colour, r) {
  if (!pts.length) return new THREE.Group();
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: colour }), pts.length);
  const d = new THREE.Object3D();
  pts.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}
function lines(runs, colour) {
  const arr = [];
  for (const run of runs) for (let i = 0; i + 1 < run.pts.length; i++) arr.push(...run.pts[i], ...run.pts[i + 1]);
  if (!arr.length) return new THREE.Group();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: colour, linewidth: 2 }));
}
function points(pts, size) {
  if (!pts.length) return new THREE.Group();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa7b3, size: size * 0.9, transparent: true, opacity: 0.45 }));
}
function boxEdges(spec) {
  const { x, y, z } = spec.cartridge.dims;
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(x, y, z));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3a4652 }));
  l.position.set(0, 0, z / 2);
  return l;
}