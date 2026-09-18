import * as THREE from 'three';
import { createRelativisticMaterial, PATTERN } from '../render/RelativisticMaterial.js';

/**
 * Pylons, arch gates, boost pads and collectable photons.
 * Everything uses the relativistic material so the warp stays consistent.
 */
export class Props {
  constructor(track) {
    this.track = track;
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.photons = [];
    this.pads = [];
    this._time = 0;

    this._materials = {
      pylonA: createRelativisticMaterial({ color: 0x63f4ff, emissive: 1.4 }),
      pylonB: createRelativisticMaterial({ color: 0xff4fd8, emissive: 1.4 }),
      gate: createRelativisticMaterial({ color: 0x241a4d, emissive: 0.5 }),
      gateBar: createRelativisticMaterial({ color: 0xffd166, emissive: 1.1 }),
      photon: createRelativisticMaterial({ color: 0xfff4c2, emissive: 2.0 }),
      pad: createRelativisticMaterial({
        color: 0x14203a,
        colorB: 0xffd166,
        pattern: PATTERN.PAD,
        side: THREE.DoubleSide,
      }),
    };

    this._buildPylons();
    this._buildGates();
    this._buildPads();
    this._buildPhotons();
    this._buildStartLine();
  }

  _place(mesh, s, lat = 0, up = 0) {
    const f = this.track.frameAt(s);
    mesh.position.copy(f.position).addScaledVector(f.lateral, lat).addScaledVector(f.normal, up);
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(f.lateral, f.normal, f.tangent)
    );
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  _buildPylons() {
    const geo = new THREE.BoxGeometry(1.1, 6.5, 1.1);
    const hw = this.track.width / 2;
    const spacing = 80;
    const n = Math.floor(this.track.length / spacing);
    for (let i = 0; i < n; i++) {
      const s = i * spacing;
      const mat = i % 2 === 0 ? this._materials.pylonA : this._materials.pylonB;
      this._place(new THREE.Mesh(geo, mat), s, -(hw + 4.5), 2.4);
      this._place(new THREE.Mesh(geo, mat), s, hw + 4.5, 2.4);
    }
  }

  _buildGates() {
    const hw = this.track.width / 2;
    const pillar = new THREE.BoxGeometry(2.2, 15, 2.2);
    const bar = new THREE.BoxGeometry(this.track.width + 12, 2.4, 2.0);
    const spacing = 300;
    const n = Math.max(1, Math.floor(this.track.length / spacing));
    for (let i = 0; i < n; i++) {
      const s = i * (this.track.length / n) + 40;
      this._place(new THREE.Mesh(pillar, this._materials.gate), s, -(hw + 3.2), 7.5);
      this._place(new THREE.Mesh(pillar, this._materials.gate), s, hw + 3.2, 7.5);
      this._place(new THREE.Mesh(bar, this._materials.gateBar), s, 0, 14.5);
    }
  }

  _buildPads() {
    const list = this.track.data.boostPads || [];
    const geo = new THREE.PlaneGeometry(this.track.width * 0.5, 22);
    geo.rotateX(-Math.PI / 2); // lie flat, +y is the road normal
    for (const u of list) {
      const s = (typeof u === 'number' ? u : u[0]) * this.track.length;
      const d = typeof u === 'number' ? 0 : u[1] || 0;
      const mesh = this._place(new THREE.Mesh(geo, this._materials.pad), s, d, 0.12);
      this.pads.push({ s, d, halfWidth: this.track.width * 0.3, mesh });
    }
  }

  _buildPhotons() {
    const list = this.track.data.photons || [];
    const geo = new THREE.OctahedronGeometry(1.7, 0);
    for (const entry of list) {
      const u = typeof entry === 'number' ? entry : entry[0];
      const d = typeof entry === 'number' ? 0 : entry[1] || 0;
      const s = u * this.track.length;
      const mesh = this._place(new THREE.Mesh(geo, this._materials.photon), s, d, 2.4);
      this.photons.push({ s, d, mesh, taken: false, phase: Math.random() * Math.PI * 2 });
    }
  }

  _buildStartLine() {
    const geo = new THREE.PlaneGeometry(this.track.width, 3);
    geo.rotateX(-Math.PI / 2);
    const mat = createRelativisticMaterial({ color: 0xffffff, emissive: 1.6 });
    this._place(new THREE.Mesh(geo, mat), 0, 0, 0.14);
  }

  update(dt) {
    this._time += dt;
    for (const ph of this.photons) {
      if (ph.taken) continue;
      ph.mesh.rotateY(dt * 2.4);
      ph.mesh.rotateX(dt * 1.1);
      const bob = Math.sin(this._time * 2.2 + ph.phase) * 0.35;
      ph.mesh.scale.setScalar(1 + bob * 0.12);
    }
  }

  reset() {
    for (const ph of this.photons) {
      ph.taken = false;
      ph.mesh.visible = true;
    }
  }
}
