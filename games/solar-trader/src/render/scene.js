import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BODIES, SUN } from '../data/bodies.js';
import { STATION_BY_ID } from '../data/stations.js';
import { bodyState, orbitSamples } from '../sim/ephemeris.js';

// Scene units are AU. Body radii are log-compressed or nothing is visible.
const visualRadius = (r) => Math.max(0.0035, 0.006 * Math.pow(r / 6.371e6, 0.34));

export class SceneView {
  constructor(canvas, labelHost, game) {
    this.game = game;
    this.labelHost = labelHost;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.002, 4000);
    this.camera.position.set(0, -4.2, 3.4);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.02;
    this.controls.maxDistance = 220;

    this.scene.add(new THREE.AmbientLight(0x2a3746, 1.0));
    const sunLight = new THREE.PointLight(0xfff0d0, 3.2, 0, 0.4);
    this.scene.add(sunLight);

    this.buildStars();
    this.buildSun();
    this.buildBodies();
    this.buildOverlays();
    this.labels = new Map();
    this.buildLabels();

    this._v = new THREE.Vector3();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- construction ----------
  buildStars() {
    const N = 2500, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u), R = 900;
      pos[i * 3] = R * s * Math.cos(th);
      pos[i * 3 + 1] = R * s * Math.sin(th);
      pos[i * 3 + 2] = R * u;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0x9fb6cc })));
  }

  buildSun() {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(visualRadius(SUN.radius), 32, 24),
      new THREE.MeshBasicMaterial({ color: SUN.color }));
    this.scene.add(m);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(visualRadius(SUN.radius) * 2.6, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.09 }));
    this.scene.add(halo);
  }

  buildBodies() {
    this.bodyMeshes = new Map();
    const t = this.game.t;
    for (const b of BODIES) {
      const mat = new THREE.MeshStandardMaterial({
        color: b.color, roughness: 0.92, metalness: 0.05,
        emissive: new THREE.Color(b.color).multiplyScalar(0.14),
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(visualRadius(b.radius), 24, 18), mat);
      this.scene.add(mesh);
      this.bodyMeshes.set(b.id, mesh);

      const pts = orbitSamples(b.id, t, 320).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: 0.22 }));
      this.scene.add(line);
    }
  }

  buildOverlays() {
    const mk = (color, width, opacity = 1) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 512), 3));
      g.setDrawRange(0, 0);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: width }));
      l.frustumCulled = false;
      this.scene.add(l);
      return l;
    };
    this.planLine = mk(0xffb44d, 2, 0.95);
    this.trailLine = mk(0x35e0ff, 2, 0.85);

    this.shipMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.012, 0),
      new THREE.MeshBasicMaterial({ color: 0x35e0ff }));
    this.scene.add(this.shipMesh);

    const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffb44d, transparent: true, opacity: 0.9 });
    this.depNode = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), nodeMat);
    this.arrNode = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), nodeMat.clone());
    this.arrNode.material.color.set(0xff6ad5);
    this.scene.add(this.depNode, this.arrNode);
  }

  buildLabels() {
    for (const b of BODIES) {
      const el = document.createElement('div');
      el.className = 'label';
      el.textContent = b.name.toUpperCase();
      this.labelHost.appendChild(el);
      this.labels.set(b.id, el);
    }
  }

  // ---------- per-frame ----------
  setLine(line, points) {
    const attr = line.geometry.getAttribute('position');
    const n = Math.min(points.length, attr.count);
    for (let i = 0; i < n; i++) {
      attr.setXYZ(i, points[i][0], points[i][1], points[i][2]);
    }
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
    line.geometry.computeBoundingSphere();
  }

  focus(bodyId) {
    const m = this.bodyMeshes.get(bodyId);
    if (!m) return;
    const d = this.camera.position.distanceTo(this.controls.target);
    this.controls.target.copy(m.position);
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.camera.position.copy(m.position).addScaledVector(dir, Math.min(d, 3.5));
  }

  update(game) {
    const t = game.t;

    for (const b of BODIES) {
      const { r } = bodyState(b.id, t);
      this.bodyMeshes.get(b.id).position.set(r[0], r[1], r[2]);
    }

    // ship
    const sp = game.shipPosition();
    this.shipMesh.position.set(sp[0], sp[1], sp[2]);

    // trail while coasting
    if (game.flight) {
      const tr = game.ship.trail;
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(last[0] - sp[0], last[1] - sp[1], last[2] - sp[2]) > 0.004) {
        tr.push([...sp]);
        if (tr.length > 500) tr.shift();
      }
      this.setLine(this.trailLine, tr);
    } else {
      this.trailLine.geometry.setDrawRange(0, 0);
    }

    // plan / active arc
    const arc = game.plan?.samples || game.flight?.samples;
    if (arc && arc.length) {
      this.setLine(this.planLine, arc);
      const a = arc[0], b = arc[arc.length - 1];
      this.depNode.visible = this.arrNode.visible = true;
      this.depNode.position.set(a[0], a[1], a[2]);
      this.arrNode.position.set(b[0], b[1], b[2]);
    } else {
      this.planLine.geometry.setDrawRange(0, 0);
      this.depNode.visible = this.arrNode.visible = false;
    }

    // labels
    const targetBody = STATION_BY_ID[game.target]?.body;
    const dockBody = game.dockedAt ? STATION_BY_ID[game.dockedAt].body : null;
    for (const [id, el] of this.labels) {
      const m = this.bodyMeshes.get(id);
      this._v.copy(m.position).project(this.camera);
      const vis = this._v.z < 1 && Math.abs(this._v.x) < 1.2 && Math.abs(this._v.y) < 1.2;
      el.style.display = vis ? 'block' : 'none';
      if (!vis) continue;
      el.style.left = `${(this._v.x * 0.5 + 0.5) * this.w}px`;
      el.style.top = `${(-this._v.y * 0.5 + 0.5) * this.h}px`;
      el.className = 'label' + (id === targetBody ? ' target' : id === dockBody ? ' station' : '');
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const el = this.renderer.domElement;
    this.w = el.clientWidth; this.h = el.clientHeight;
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }
}