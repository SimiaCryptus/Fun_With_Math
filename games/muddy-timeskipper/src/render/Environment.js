import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from './MudTerrain.js';
import { TERRAIN_NOISE_GLSL, terrainNoise } from '../track/terrainNoise.js';
import { RNG } from '../core/RNG.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
const _s = new THREE.Vector3(), _e = new THREE.Euler();
const TAU = Math.PI * 2;

function setInst(mesh, i, x, y, z, yaw, sx = 1, sy = 1, sz = 1, tiltX = 0, tiltZ = 0) {
  _e.set(tiltX, yaw, tiltZ); _q.setFromEuler(_e);
  _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

/** Canvas banner: checker border + Impact text. Zero assets. */
function bannerTexture(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#14100a'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#e8e0cc';
  for (let i = 0; i < 32; i++) {
    if (i % 2 === 0) g.fillRect(i * 32, 0, 32, 32);
    if (i % 2 === 1) g.fillRect(i * 32, 224, 32, 32);
  }
  g.font = '700 140px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#000'; g.fillStyle = '#ffd21f';
  g.strokeText(text, 512, 132); g.fillText(text, 512, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/**
 * Everything that makes the world read as a place rather than a lit plane:
 * sky dome, infinite outer ground, distant hills, tyre-stack barriers placed exactly
 * on the TrackSpline.contain() wall line, start gantry, checkpoint poles, dead
 * trees, boulders, cattails around the mud pits and geyser mounds.
 * Render-only: reads spline/field/track data, never writes sim state.
 */
export class Environment {
  constructor(scene, { spline, field, track, sunDir, palette = {} }) {
    this.group = new THREE.Group();
    this.rng = new RNG(((track.seed || 1) ^ 0x5bd1e995) >>> 0);
    this.P = {
      zenith:  new THREE.Color(palette.zenith  ?? 0x35507a),
      horizon: new THREE.Color(palette.horizon ?? 0x9a7c4c),
      sun:     new THREE.Color(palette.sun     ?? 0xffe2b0),
      grass:   new THREE.Color(palette.grass   ?? 0x55602a),
      dry:     new THREE.Color(palette.dry     ?? 0x7a5f2c),
      wet:     new THREE.Color(palette.wet     ?? 0x261a0a)
    };
    this._sky(sunDir);
    this._outerGround();
    this._hills(field);
    this._barriers(spline);
    this._gantry(spline, track);
    this._checkpoints(spline, track);
    this._flora(spline, field, track);
    this._hazards(track);
    scene.add(this.group);
  }

  /** Per frame: the sky dome rides with the camera. */
  update(camera) { this.sky.position.copy(camera.position); }

  // ------------------------------------------------------------------ sky
  _sky(sunDir) {
    const P = this.P;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: P.zenith }, uHorizon: { value: P.horizon },
        uGround: { value: P.dry.clone().multiplyScalar(0.55) },
        uSunDir: { value: sunDir.clone() }, uSunCol: { value: P.sun }
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunCol; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          c = mix(c, uGround, smoothstep(0.0, -0.12, h));
          c += uHorizon * 0.25 * exp(-abs(h) * 14.0);            // haze band
          float s = max(dot(d, uSunDir), 0.0);
          c += uSunCol * (pow(s, 300.0) * 2.0 + pow(s, 6.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
  }

  // --------------------------------------------------------- outer ground
  _outerGround() {
    const P = this.P;
    const geo = new THREE.PlaneGeometry(6000, 6000, 300, 300);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGrass = { value: P.grass };
      shader.uniforms.uDry = { value: P.dry };
      shader.uniforms.uWet = { value: P.wet };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorld;\n${TERRAIN_NOISE_GLSL}`)
        .replace('#include <begin_vertex>', /* glsl */`
          vec3 transformed = vec3(position);
          transformed.y += mtTerrainHeight(transformed.xz) - 0.12;
          vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uGrass, uDry, uWet; varying vec3 vWorld;\n${NOISE_GLSL}`)
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          diffuseColor.rgb = mix(mtOffTrack(vWorld.xz, uGrass, uDry), uWet, 0.13);`);
    };
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);
  }

  // ---------------------------------------------------------------- hills
  _hills(field) {
    const rng = this.rng;
    const geo = new THREE.SphereGeometry(1, 20, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3c4626, roughness: 1 });
    const cx = field.minX + field.size / 2, cz = field.minZ + field.size / 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rng.range(-0.15, 0.15);
      const r = rng.range(760, 1080);
      const w = rng.range(180, 440), h = rng.range(55, 160);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx + Math.cos(a) * r, -h * 0.35, cz + Math.sin(a) * r);
      m.scale.set(w, h, w * rng.range(0.6, 1.1));
      m.rotation.y = rng.range(0, TAU);
      this.group.add(m);
    }
  }

  // ------------------------------------------------------------- barriers
  /** Tyre stacks along both edges. The sim wall is at half-width; a stack's inner
   *  face sits at half + 1.4 so a 2.7 m wide truck just kisses the rubber. */
  _barriers(spline) {
    const rng = this.rng;
    const tire = new THREE.TorusGeometry(0.58, 0.24, 8, 16).rotateX(Math.PI / 2);
    const stack = mergeGeometries([0, 1, 2].map((k) => tire.clone().translate(0, 0.24 + k * 0.46, 0)));
    tire.dispose();

    const N = spline.samples, step = 4.6;
    const per = Math.ceil(spline.length / step);
    const mesh = new THREE.InstancedMesh(stack,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), per * 2);
    mesh.castShadow = true; mesh.receiveShadow = true;

    const black = new THREE.Color(0x1c1917), cream = new THREE.Color(0xd8cfbb), red = new THREE.Color(0xb8321f);
    let i = 0;
    for (let n = 0; n < per; n++) {
      const k = ((spline.ahead(0, n * step) % N) + N) % N;
      const p = spline.at(k);
      const nx = -p.tz, nz = p.tx, half = p.width * 0.5;
      for (const side of [-1, 1]) {
        const off = half + 2.25 + rng.range(-0.1, 0.2);
        const x = p.x + nx * off * side, z = p.z + nz * off * side;
        setInst(mesh, i, x, terrainNoise(x, z) - 0.05, z, rng.range(0, TAU), 1, 1, 1,
          rng.range(-0.05, 0.05), rng.range(-0.05, 0.05));
        mesh.setColorAt(i, n % 8 === 0 ? red : n % 2 === 0 ? cream : black);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
  }

  // --------------------------------------------------------------- gantry
  _gantry(spline, track) {
    const p = spline.at(0);
    const nx = -p.tz, nz = p.tx, half = p.width * 0.5, span = half + 2.4;
    const yaw = Math.atan2(-p.tx, -p.tz);   // local +X along track normal, face toward approaching cars
    const g = new THREE.Group();
    g.position.set(p.x, terrainNoise(p.x, p.z), p.z);
    g.rotation.y = yaw;

    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.7, metalness: 0.4 });
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.45, 7.2, 10).translate(0, 3.6, 0);
    for (const sx of [-span, span]) {
      const pil = new THREE.Mesh(pillarGeo, steel);
      pil.position.x = sx; pil.castShadow = true;
      g.add(pil);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(span * 2 + 0.9, 1.8, 0.5),
      new THREE.MeshStandardMaterial({ map: bannerTexture(track.name?.toUpperCase() || 'START'), roughness: 0.8 })
    );
    beam.position.y = 7.4; beam.castShadow = true;
    g.add(beam);
    void nx; void nz;
    this.group.add(g);
  }

  // ---------------------------------------------------------- checkpoints
  _checkpoints(spline, track) {
    const cps = track.checkpoints || [0, 0.25, 0.5, 0.75];
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 6, 8).translate(0, 3, 0);
    const flagGeo = new THREE.BoxGeometry(1.6, 0.9, 0.06).translate(0.8, 5.4, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xff7a1f, roughness: 0.8 });
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.9, side: THREE.DoubleSide });
    for (let c = 1; c < cps.length; c++) {
      const p = spline.at(Math.round(cps[c] * spline.samples));
      const nx = -p.tz, nz = p.tx, off = p.width * 0.5 + 2.4;
      for (const side of [-1, 1]) {
        const x = p.x + nx * off * side, z = p.z + nz * off * side;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, terrainNoise(x, z), z); pole.castShadow = true;
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.rotation.y = Math.atan2(p.tx, p.tz);
        pole.add(flag);
        this.group.add(pole);
      }
    }
  }

  // ---------------------------------------------------------------- flora
  _scatter(spline, field, count, clearance, place) {
    const rng = this.rng;
    const x0 = field.minX - 140, x1 = field.minX + field.size + 140;
    const z0 = field.minZ - 140, z1 = field.minZ + field.size + 140;
    let placed = 0;
    for (let tries = 0; tries < count * 30 && placed < count; tries++) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1);
      const n = spline.nearest(x, z, -1);
      if (n.dist < spline.w[n.index] * 0.5 + clearance) continue;
      place(x, z, placed++);
    }
    return placed;
  }

  _flora(spline, field, track) {
    const rng = this.rng;

    // dead trees
    const parts = [new THREE.CylinderGeometry(0.22, 0.6, 6.8, 7).translate(0, 3.4, 0)];
    for (const [a, h] of [[0.3, 4.2], [2.4, 5.1], [4.4, 5.9]]) {
      parts.push(new THREE.CylinderGeometry(0.05, 0.2, 3.4, 5).translate(0, 1.7, 0)
        .rotateZ(0.8).rotateY(a).translate(0, h, 0));
    }
    const trees = new THREE.InstancedMesh(mergeGeometries(parts),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }), 160);
    trees.castShadow = true;
    trees.count = this._scatter(spline, field, 160, 9, (x, z, i) => {
      const s = rng.range(0.7, 1.6);
      setInst(trees, i, x, terrainNoise(x, z) - 0.2, z, rng.range(0, TAU), s, s * rng.range(0.8, 1.3), s,
        rng.range(-0.1, 0.1), rng.range(-0.1, 0.1));
    });
    trees.instanceMatrix.needsUpdate = true;
    this.group.add(trees);

    // boulders
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.3, 1),
      new THREE.MeshStandardMaterial({ color: 0x5f5648, roughness: 1, flatShading: true }), 90);
    rocks.castShadow = true; rocks.receiveShadow = true;
    rocks.count = this._scatter(spline, field, 90, 4, (x, z, i) => {
      const s = rng.range(0.7, 2.6);
      setInst(rocks, i, x, terrainNoise(x, z) - s * 0.35, z, rng.range(0, TAU),
        s, s * rng.range(0.5, 0.9), s * rng.range(0.7, 1.3), rng.range(-0.3, 0.3), rng.range(-0.3, 0.3));
    });
    rocks.instanceMatrix.needsUpdate = true;
    this.group.add(rocks);

    // cattails ringing the mud pits (outside the racing surface)
    const zones = track.mudZones || [];
    const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 2.4, 5).translate(0, 1.2, 0),
      new THREE.MeshStandardMaterial({ color: 0x6b7d2c, roughness: 1 }), zones.length * 60);
    let r = 0;
    for (const zn of zones) {
      for (let tries = 0; tries < 400 && r < (zones.indexOf(zn) + 1) * 60; tries++) {
        const a = rng.range(0, TAU), d = zn.r * rng.range(0.7, 1.4);
        const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
        const n = spline.nearest(x, z, -1);
        if (n.dist < spline.w[n.index] * 0.5 + 1.2) continue;
        setInst(reeds, r++, x, terrainNoise(x, z) - 0.1, z, rng.range(0, TAU), 1, rng.range(0.7, 1.3), 1,
          rng.range(-0.15, 0.15), rng.range(-0.15, 0.15));
      }
    }
    reeds.count = r; reeds.instanceMatrix.needsUpdate = true;
    this.group.add(reeds);
  }

  // -------------------------------------------------------------- hazards
  _hazards(track) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c1f0c, roughness: 0.6 });
    const geo = new THREE.SphereGeometry(1, 14, 8);
    for (const h of track.hazards || []) {
      const m = new THREE.Mesh(geo, mat);
      const big = h.type === 'worm';
      m.position.set(h.x, terrainNoise(h.x, h.z) - 0.4, h.z);
      m.scale.set(big ? 6 : 3.5, big ? 1.6 : 0.9, big ? 4 : 3.5);
      m.castShadow = true;
      this.group.add(m);
    }
  }
}