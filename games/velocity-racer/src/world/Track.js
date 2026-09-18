import * as THREE from 'three';
import { createRelativisticMaterial, PATTERN } from '../render/RelativisticMaterial.js';
import { PHOTON_CIRCUIT } from './trackData.js';
import { G, clamp } from '../relativity/constants.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Catmull-Rom spline track with arc-length sampled frames, auto banking
 * and ribbon meshes (road, apron, rails) built from those frames.
 */
export class Track {
  static async load(url) {
    let data = PHOTON_CIRCUIT;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) data = await res.json();
      else console.warn('[Track] %s -> %d, using built-in data', url, res.status);
    } catch (err) {
      console.warn('[Track] fetch failed, using built-in data', err);
    }
    return new Track(data);
  }

  constructor(data) {
    this.data = data;
    this.name = data.name || 'Untitled Circuit';
    this.width = data.width || 26;

    const pts = data.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', data.tension ?? 0.5);
    this.length = this.curve.getLength();
    this.count = data.samples || 720;

    this._buildFrames();

    this.group = new THREE.Group();
    this.group.name = 'track';
    this.materials = [];
    this._buildMeshes();

    this._frame = {
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      lateral: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      s: 0,
    };
  }

  // ---------------------------------------------------------------- frames

  _buildFrames() {
    const N = this.count;
    this.pos = [];
    this.tan = [];
    this.lat = [];
    this.nor = [];
    this.sList = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u).normalize();
      const l = new THREE.Vector3().crossVectors(t, UP).normalize(); // "right"
      const n = new THREE.Vector3().crossVectors(l, t).normalize(); // road up
      this.pos.push(p);
      this.tan.push(t);
      this.lat.push(l);
      this.nor.push(n);
      this.sList[i] = u * this.length;
    }

    // Banking: either authored (degrees, uniform over the lap) or derived
    // from curvature for a reference speed.
    const ds = this.length / N;
    const raw = new Float32Array(N);
    const authored = Array.isArray(this.data.banking) && this.data.banking.length > 1;
    const vRef = this.data.bankingRefSpeed ?? 30;

    for (let i = 0; i < N; i++) {
      if (authored) {
        const a = this.data.banking;
        const x = (i / N) * a.length;
        const i0 = Math.floor(x) % a.length;
        const i1 = (i0 + 1) % a.length;
        const f = x - Math.floor(x);
        raw[i] = THREE.MathUtils.degToRad(a[i0] * (1 - f) + a[i1] * f);
      } else {
        const tPrev = this.tan[(i - 1 + N) % N];
        const tNext = this.tan[(i + 1) % N];
        const kx = (tNext.x - tPrev.x) / (2 * ds);
        const ky = (tNext.y - tPrev.y) / (2 * ds);
        const kz = (tNext.z - tPrev.z) / (2 * ds);
        const kLat = kx * this.lat[i].x + ky * this.lat[i].y + kz * this.lat[i].z;
        raw[i] = clamp(Math.atan((vRef * vRef * kLat) / G), -0.5, 0.5);
      }
    }

    // smooth, then roll the frame about the tangent
    this.bank = new Float32Array(N);
    const K = 8;
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let j = -K; j <= K; j++) acc += raw[(i + j + N) % N];
      this.bank[i] = acc / (2 * K + 1);
    }
    for (let i = 0; i < N; i++) {
      const a = this.bank[i];
      if (Math.abs(a) < 1e-5) continue;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const l = this.lat[i].clone();
      const n = this.nor[i].clone();
      // rotate about tangent: n' = n cos + lat sin ; lat' = lat cos - n sin
      this.nor[i].copy(n).multiplyScalar(c).addScaledVector(l, s).normalize();
      this.lat[i].copy(l).multiplyScalar(c).addScaledVector(n, -s).normalize();
    }
  }

  sampleAt(i) {
    const k = ((i % this.count) + this.count) % this.count;
    return {
      position: this.pos[k],
      tangent: this.tan[k],
      lateral: this.lat[k],
      normal: this.nor[k],
      s: this.sList[k],
    };
  }

  /** Interpolated frame at arc length `s` (metres, wraps). */
  frameAt(s, out = this._frame) {
    const N = this.count;
    const L = this.length;
    const u = ((s % L) + L) % L;
    const x = (u / L) * N;
    const i = Math.floor(x) % N;
    const j = (i + 1) % N;
    const f = x - Math.floor(x);

    out.position.copy(this.pos[i]).lerp(this.pos[j], f);
    out.tangent.copy(this.tan[i]).lerp(this.tan[j], f).normalize();
    out.lateral.copy(this.lat[i]).lerp(this.lat[j], f).normalize();
    out.normal.copy(this.nor[i]).lerp(this.nor[j], f).normalize();
    out.s = u;
    return out;
  }

  // ---------------------------------------------------------------- meshes

  /**
   * Builds a closed ribbon.
   * @param {Array<{lat:number, up:number, u:number, nl?:number, nu?:number}>} cols
   */
  _ribbon(cols) {
    const N = this.count;
    const C = cols.length;
    const positions = new Float32Array(N * C * 3);
    const normals = new Float32Array(N * C * 3);
    const uvs = new Float32Array(N * C * 2);
    const index = [];
    const p = new THREE.Vector3();
    const nv = new THREE.Vector3();

    for (let i = 0; i < N; i++) {
      const f = this.sampleAt(i);
      for (let c = 0; c < C; c++) {
        const col = cols[c];
        const o = (i * C + c) * 3;
        p.copy(f.position).addScaledVector(f.lateral, col.lat).addScaledVector(f.normal, col.up);
        positions[o] = p.x;
        positions[o + 1] = p.y;
        positions[o + 2] = p.z;
        nv.set(0, 0, 0)
          .addScaledVector(f.lateral, col.nl ?? 0)
          .addScaledVector(f.normal, col.nu ?? 1)
          .normalize();
        normals[o] = nv.x;
        normals[o + 1] = nv.y;
        normals[o + 2] = nv.z;
        const uo = (i * C + c) * 2;
        uvs[uo] = col.u;
        uvs[uo + 1] = f.s;
      }
    }

    for (let i = 0; i < N; i++) {
      const a = i * C;
      const b = ((i + 1) % N) * C;
      for (let c = 0; c < C - 1; c++) {
        index.push(a + c, b + c, a + c + 1, a + c + 1, b + c, b + c + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    return geo;
  }

  _add(geo, material, name) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.frustumCulled = false; // vertices move in the shader
    this.group.add(mesh);
    this.materials.push(material);
    return mesh;
  }

  _buildMeshes() {
    const hw = this.width / 2;

    // road (8 columns across for a smooth warp)
    const cols = [];
    const steps = 7;
    for (let c = 0; c <= steps; c++) {
      const u = c / steps;
      cols.push({ lat: (u - 0.5) * this.width, up: 0.02, u });
    }
    this._add(
      this._ribbon(cols),
      createRelativisticMaterial({
        color: 0x1b2233,
        colorB: 0x8ef6ff,
        pattern: PATTERN.ROAD,
        side: THREE.DoubleSide,
      }),
      'road'
    );

    // apron / shoulders
    this._add(
      this._ribbon([
        { lat: -hw * 4.5, up: -2.2, u: 0 },
        { lat: -hw * 1.02, up: -0.06, u: 0.35 },
        { lat: hw * 1.02, up: -0.06, u: 0.65 },
        { lat: hw * 4.5, up: -2.2, u: 1 },
      ]),
      createRelativisticMaterial({
        color: 0x0a0d1c,
        pattern: PATTERN.FLAT,
        emissive: 0.05,
        side: THREE.DoubleSide,
      }),
      'apron'
    );

    // guard rails
    for (const sign of [-1, 1]) {
      this._add(
        this._ribbon([
          { lat: sign * (hw + 0.25), up: 0.0, u: 0, nl: -sign, nu: 0.2 },
          { lat: sign * (hw + 0.75), up: 3.4, u: 1, nl: -sign, nu: 0.2 },
        ]),
        createRelativisticMaterial({
          color: sign < 0 ? 0x2a0f45 : 0x0f2a45,
          colorB: sign < 0 ? 0xff4fd8 : 0x63f4ff,
          pattern: PATTERN.RAIL,
          side: THREE.DoubleSide,
        }),
        sign < 0 ? 'rail-left' : 'rail-right'
      );
    }
  }

  /** Orientation matrix (x=lateral, y=normal, z=tangent) at arc length s. */
  basisAt(s, out = new THREE.Matrix4()) {
    const f = this.frameAt(s);
    return out.makeBasis(f.lateral, f.normal, f.tangent);
  }
}
