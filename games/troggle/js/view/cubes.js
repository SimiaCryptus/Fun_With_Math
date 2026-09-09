/**
 * cubes.js — the block itself (§5.2, §14).
 *
* *Letters only.* The block is a cloud of opaque, camera-facing glyphs floating
* at the cube centres (glyph atlas + per-instance UV offset). The glass cell
* meshes are still built (same shader, same tier bookkeeping) but they are not
* added to the scene by default — nothing occludes a letter, and nothing can be
* clicked except a letter. The glyphs write depth, so front letters occlude
* back letters, and letters deeper than the block centre shrink/fade slightly
* so 5³/6³ stay legible.
*
* Picking (§4.1) therefore happens against the glyph quads in screen space:
* pickLetter() finds the glyph whose rendered pixels contain the pointer (with
* a small slop so near-misses still land), nearest-to-camera first. Faint
* letters (sliced-away layers) are not pickable unless they are "preferred"
* (i.e. the player is backtracking along their own path).
 *
 * Effects/renderer write *targets*; update(dt) eases toward them and rebuilds
 * the instance buffers with pre-allocated scratch objects (no per-frame allocs).
 */

import * as THREE from 'three';
import { createAtlas } from './atlas.js';

const TIER_HIDDEN = 0;
const TIER_SOLID = 1;
const TIER_GHOST = 2;
export const TIER = { HIDDEN: TIER_HIDDEN, SOLID: TIER_SOLID, GHOST: TIER_GHOST };

/** Fill opacity of the glass per tier (edges and glow add on top). */
export const OPACITY = Object.freeze({ SOLID: 0.3, GHOST: 0.05, XRAY_GHOST: 0.16 });
/** Fraction of the glyph quad that counts as "on the letter". */
const GLYPH_HIT = 0.9;
/** How far outside the glyph a near-miss still snaps (× half extent). */
const PICK_SLOP = 1.35;
/** §4.1: ghosts faint enough to be decoration are not selectable. */
const PICK_MIN_ALPHA = 0.35;

const CUBE_VERT = /* glsl */ `
  attribute float aGlow;
  varying vec3 vColor;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vToCamera;
  varying float vGlow;
  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vUv = uv;
    vGlow = aGlow;
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vNormalW = normalize(mat3(m) * normal);
    vToCamera = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const CUBE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vToCamera;
  varying float vGlow;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vToCamera);
    float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
    float fresnel = pow(1.0 - ndv, 2.5);            // glass: edge-on faces read stronger
    vec2 d = min(vUv, 1.0 - vUv);                   // BoxGeometry uv is 0..1 per face
    float edge = 1.0 - smoothstep(0.0, 0.06, min(d.x, d.y));
    float light = 0.8 + 0.2 * max(n.y, 0.0);
    vec3 fill = vColor * light * (1.0 + 0.5 * fresnel + 0.6 * vGlow);
    vec3 col = mix(fill, vColor * 1.7 + 0.06, edge);
    float a = uOpacity * (0.5 + 1.2 * fresnel) + 0.35 * vGlow;
    a = max(a, edge * min(1.0, uOpacity * 2.5 + 0.45 * vGlow));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

const LETTER_VERT = /* glsl */ `
  uniform float uViewDist;   // camera → block centre
  uniform float uFadeRange;  // ~half the block depth
  attribute vec3 aOffset;
  attribute vec4 aUv;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aScale;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vUv = aUv.xy + uv * aUv.zw;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    // letters behind the block centre get a little smaller and fainter
    float behind = clamp((-mv.z - uViewDist) / uFadeRange, 0.0, 1.0);
    float s = aScale * (1.0 - 0.18 * behind);
    vAlpha = aAlpha * (1.0 - 0.5 * behind);
    mv.xyz += vec3(position.x, position.y, 0.0) * s;   // camera-facing quad at the cube centre
    gl_Position = projectionMatrix * mv;
  }
`;

const LETTER_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(map, vUv);          // r = glyph mask, a = glyph + dark halo
    if (t.a < 0.25) discard;               // hard cut so depth-write stays clean
    vec3 c = mix(vec3(0.015, 0.02, 0.03), vColor, t.r);
    gl_FragColor = vec4(c, t.a * vAlpha);
    #include <colorspace_fragment>
  }
`;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _proj = new THREE.Vector3();

export class CubeField {
  /**
   * @param {import('../core/grid.js').Grid} grid
   */
   constructor(grid, { spacing = 1.16, cubeSize = 1, atlas = null, showCubes = false } = {}) {
    this.grid = grid;
    this.count = grid.count;
    this.spacing = spacing;
    this.cubeSize = cubeSize;
    this.atlas = atlas ?? createAtlas();
     this.showCubes = showCubes;
    this.group = new THREE.Group();

    const n = this.count;
    this.base = new Float32Array(n * 3);
    this.offset = new Float32Array(n * 3);
    this.curColor = new Float32Array(n * 3);
    this.tgtColor = new Float32Array(n * 3);
    this.curLetter = new Float32Array(n * 3);
    this.tgtLetter = new Float32Array(n * 3);
    this.curScale = new Float32Array(n).fill(1);
    this.tgtScale = new Float32Array(n).fill(1);
    this.curAlpha = new Float32Array(n).fill(1);
    this.tgtAlpha = new Float32Array(n).fill(1);
    this.curGlow = new Float32Array(n);
    this.tgtGlow = new Float32Array(n);
    this.tier = new Uint8Array(n).fill(TIER_SOLID);
    this.solidOpacity = OPACITY.SOLID;
    this._solidOpacityTarget = OPACITY.SOLID;
    this.ghostOpacity = OPACITY.GHOST;
    this._ghostOpacityTarget = OPACITY.GHOST;
    this.viewDistance = 1e6;
    this.pickGhost = false;
    this._flash = new Float32Array(n);
    this._ghostLetters = new Int32Array(n);
     // Glyph-quad pick data, refilled every frame (the letters are the only
     // pickable thing now).
     this.letterCount = 0;
     this.letterIndex = new Int32Array(n);
     this.letterPos = new Float32Array(n * 3);
     this.letterScale = new Float32Array(n);
     this.letterAlpha = new Float32Array(n);


    // cube centres, block centred on the origin; grid y grows downward
    const off = (grid.size - 1) / 2;
    const c = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      grid.coords(i, c);
      this.base[i * 3] = (c.x - off) * spacing;
      this.base[i * 3 + 1] = (off - c.y) * spacing;
      this.base[i * 3 + 2] = (c.z - off) * spacing;
    }

    this.solid = this._makeMesh(false);
    this.ghost = this._makeMesh(true);
     this.solid.visible = this.showCubes;
     this.ghost.visible = this.showCubes;
     if (this.showCubes) this.group.add(this.solid, this.ghost);

    this.solidPick = new Int32Array(n).fill(-1);
    this.ghostPick = new Int32Array(n).fill(-1);
    this.solid.userData.pick = this.solidPick;
    this.ghost.userData.pick = this.ghostPick;

    this._buildLetters();
  }

  _makeMesh(isGhost) {
    // Each mesh needs its own geometry because the per-instance glow attribute
    // is filled in a different order for the two tiers.
    const geometry = new THREE.BoxGeometry(this.cubeSize, this.cubeSize, this.cubeSize, 1, 1, 1);
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(this.count), 1);
    glow.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aGlow', glow);

    const material = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: isGhost ? OPACITY.GHOST : OPACITY.SOLID } },
      vertexShader: CUBE_VERT,
      fragmentShader: CUBE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, this.count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = isGhost ? 2 : 0;
    mesh.userData.glow = glow;
    return mesh;
  }

  _buildLetters() {
    const plane = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute('position', plane.attributes.position);
    g.setAttribute('uv', plane.attributes.uv);

    const n = this.count;
    this._aOffset = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this._aUv = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this._aColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this._aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this._aScale = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    for (const a of [this._aOffset, this._aUv, this._aColor, this._aAlpha, this._aScale]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    g.setAttribute('aOffset', this._aOffset);
    g.setAttribute('aUv', this._aUv);
    g.setAttribute('aColor', this._aColor);
    g.setAttribute('aAlpha', this._aAlpha);
    g.setAttribute('aScale', this._aScale);
    g.instanceCount = 0;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.atlas.texture },
        uViewDist: { value: 1e6 },
        uFadeRange: { value: Math.max(1, this.grid.size * this.spacing * 0.5) },
      },
      vertexShader: LETTER_VERT,
      fragmentShader: LETTER_FRAG,
      transparent: true,
      depthWrite: true,   // front letters occlude back letters
      depthTest: true,
      toneMapped: false,
    });

    this.letterGeometry = g;
    this.letters = new THREE.Mesh(g, material);
    this.letters.frustumCulled = false;
    this.letters.renderOrder = 3;
    this.group.add(this.letters);
    plane.dispose();
  }

  // ------------------------------------------------------------- targets

  /**
   * @param {number} i
   * @param {{color:number, letter:number, scale:number, alpha:number, tier:number, glow?:number}} s
   */
  setTarget(i, s) {
    _c.set(s.color);
    this.tgtColor[i * 3] = _c.r; this.tgtColor[i * 3 + 1] = _c.g; this.tgtColor[i * 3 + 2] = _c.b;
    _c.set(s.letter);
    this.tgtLetter[i * 3] = _c.r; this.tgtLetter[i * 3 + 1] = _c.g; this.tgtLetter[i * 3 + 2] = _c.b;
    this.tgtScale[i] = s.scale;
    this.tgtAlpha[i] = s.alpha;
    this.tgtGlow[i] = s.glow ?? 0;
    this.tier[i] = s.tier;
  }

  setOffset(i, x, y, z) {
    this.offset[i * 3] = x;
    this.offset[i * 3 + 1] = y;
    this.offset[i * 3 + 2] = z;
  }

  setSolidOpacity(v) {
    this._solidOpacityTarget = v;
  }

  setGhostOpacity(v) {
    this._ghostOpacityTarget = v;
  }

  /** Camera → block-centre distance; letters deeper than this fade a little. */
  setViewDistance(d) {
    this.viewDistance = d;
  }

  /** One-shot white flash on a cube (illegal tap / hint). */
  flash(i, amount = 1) {
    if (i >= 0 && i < this.count) this._flash[i] = amount;
  }

  centerOf(i, out = new THREE.Vector3()) {
    return out.set(
      this.base[i * 3] + this.offset[i * 3],
      this.base[i * 3 + 1] + this.offset[i * 3 + 1],
      this.base[i * 3 + 2] + this.offset[i * 3 + 2],
    );
  }

  pickTargets() {
     if (!this.showCubes) return [];
    return this.pickGhost ? [this.solid, this.ghost] : [this.solid];
  }

  pickFor(mesh, instanceId) {
    const map = mesh.userData.pick;
    if (!map || instanceId == null || instanceId < 0) return -1;
    return map[instanceId] ?? -1;
  }
   /**
    * Cube index whose *glyph* is under a canvas-space pixel, or -1.
    *
    * Screen-space test against the letter quads: a glyph that contains the
    * point wins (nearest to camera first), otherwise the closest near-miss
    * within PICK_SLOP wins, so tapping "between" letters still resolves to the
    * letter you meant. Indices in `prefer` (legal next cubes, the head/tail of
    * the current path) beat everything else, which is how you reach an interior
    * letter you can see behind a front one.
    *
    * @param {number} px            pointer x in canvas pixels
    * @param {number} py            pointer y in canvas pixels
    * @param {number} width         canvas css width
    * @param {number} height        canvas css height
    * @param {THREE.PerspectiveCamera} camera
    * @param {Set<number>|null} [prefer]
    * @returns {number} cube index, or -1
    */
   pickLetter(px, py, width, height, camera, prefer = null) {
     const pxPerUnitAtUnitDepth = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
     let hit = -1, hitDepth = Infinity;
     let hitPref = -1, hitPrefDepth = Infinity;
     let near = -1, nearScore = Infinity;
     let nearPref = -1, nearPrefScore = Infinity;
     for (let k = 0; k < this.letterCount; k++) {
       const i = this.letterIndex[k];
       const preferred = prefer ? prefer.has(i) : false;
       if (!preferred && this.letterAlpha[k] < PICK_MIN_ALPHA) continue;
       _proj.set(this.letterPos[k * 3], this.letterPos[k * 3 + 1], this.letterPos[k * 3 + 2]);
       const depth = _proj.distanceTo(camera.position);
       _proj.project(camera);
       if (!(_proj.z >= -1 && _proj.z <= 1)) continue;   // behind / outside frustum
       const sx = (_proj.x * 0.5 + 0.5) * width;
       const sy = (-_proj.y * 0.5 + 0.5) * height;
       const half = (this.letterScale[k] * 0.5 * pxPerUnitAtUnitDepth) / Math.max(1e-3, depth);
       const dx = Math.abs(px - sx);
       const dy = Math.abs(py - sy);
       if (dx <= half * GLYPH_HIT && dy <= half * GLYPH_HIT) {
         if (preferred) {
           if (depth < hitPrefDepth) { hitPref = i; hitPrefDepth = depth; }
         } else if (depth < hitDepth) { hit = i; hitDepth = depth; }
         continue;
       }
       const slop = half * PICK_SLOP;
       const d = Math.max(dx, dy) / Math.max(1e-3, slop);
       if (d <= 1) {
         const score = d + depth * 1e-4;
         if (preferred) {
           if (score < nearPrefScore) { nearPref = i; nearPrefScore = score; }
         } else if (score < nearScore) { near = i; nearScore = score; }
       }
     }
     if (hitPref >= 0) return hitPref;
     if (hit >= 0) return hit;
     if (nearPref >= 0) return nearPref;
     return near;
   }


  // -------------------------------------------------------------- update

  _writeLetter(slot, i, p, scale, alpha) {
    const uv = this.atlas.get(this.grid.letterAt(i));
     const worldScale = scale * this.cubeSize * 0.84;
    this._aOffset.setXYZ(slot, p.x, p.y, p.z);
    this._aUv.setXYZW(slot, uv[0], uv[1], uv[2], uv[3]);
    this._aColor.setXYZ(
      slot,
      this.curLetter[i * 3],
      this.curLetter[i * 3 + 1],
      this.curLetter[i * 3 + 2],
    );
    this._aAlpha.setX(slot, alpha);
     this._aScale.setX(slot, worldScale);

     // mirror into the pick arrays
     this.letterIndex[slot] = i;
     this.letterPos[slot * 3] = p.x;
     this.letterPos[slot * 3 + 1] = p.y;
     this.letterPos[slot * 3 + 2] = p.z;
     this.letterScale[slot] = worldScale;
     this.letterAlpha[slot] = alpha;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    const ks = 1 - Math.exp(-dt * 18);
     const drawCubes = this.showCubes;
    let solidN = 0;
    let ghostN = 0;
    let letterN = 0;
    let ghostLetterN = 0;

    this.solidOpacity += (this._solidOpacityTarget - this.solidOpacity) * k;
    this.ghostOpacity += (this._ghostOpacityTarget - this.ghostOpacity) * k;
    this.solid.material.uniforms.uOpacity.value = this.solidOpacity;
    this.ghost.material.uniforms.uOpacity.value = this.ghostOpacity;
    this.letters.material.uniforms.uViewDist.value = this.viewDistance;

    const solidGlow = this.solid.userData.glow;
    const ghostGlow = this.ghost.userData.glow;

    for (let i = 0; i < this.count; i++) {
      for (let c = 0; c < 3; c++) {
        const o = i * 3 + c;
        this.curColor[o] += (this.tgtColor[o] - this.curColor[o]) * k;
        this.curLetter[o] += (this.tgtLetter[o] - this.curLetter[o]) * k;
      }
      this.curScale[i] += (this.tgtScale[i] - this.curScale[i]) * ks;
      this.curAlpha[i] += (this.tgtAlpha[i] - this.curAlpha[i]) * k;
      this.curGlow[i] += (this.tgtGlow[i] - this.curGlow[i]) * ks;
      if (this._flash[i] > 0) this._flash[i] = Math.max(0, this._flash[i] - dt * 3);

      const tier = this.tier[i];
      if (tier === TIER_HIDDEN) continue;

      this.centerOf(i, _p);
      const scale = this.curScale[i];
      _s.setScalar(scale);
      _m.compose(_p, _q, _s);

      const f = this._flash[i];
      let r = this.curColor[i * 3];
      let g = this.curColor[i * 3 + 1];
      let b = this.curColor[i * 3 + 2];
      if (f > 0) {
        r = r + (1 - r) * f;
        g = g * (1 - f * 0.7);
        b = b * (1 - f * 0.7);
      }
      const glow = Math.max(this.curGlow[i], f);

      if (tier === TIER_SOLID) {
         if (drawCubes) {
           this.solid.setMatrixAt(solidN, _m);
           this.solid.instanceColor.setXYZ(solidN, r, g, b);
           solidGlow.setX(solidN, glow);
           this.solidPick[solidN] = i;
         }
        solidN++;
      } else {
         if (drawCubes) {
           this.ghost.setMatrixAt(ghostN, _m);
           this.ghost.instanceColor.setXYZ(ghostN, r, g, b);
           ghostGlow.setX(ghostN, glow);
           this.ghostPick[ghostN] = i;
         }
        ghostN++;
      }

      const alpha = this.curAlpha[i];
      if (alpha > 0.02) {
        // Clear-tier letters are written first so their depth is in place before
        // the faint ghost letters are tested against it.
        if (tier === TIER_SOLID) this._writeLetter(letterN++, i, _p, scale, alpha);
        else this._ghostLetters[ghostLetterN++] = i;
      }
    }

    for (let j = 0; j < ghostLetterN; j++) {
      const i = this._ghostLetters[j];
      this.centerOf(i, _p);
      this._writeLetter(letterN++, i, _p, this.curScale[i], this.curAlpha[i]);
    }

     if (drawCubes) {
       this.solid.count = solidN;
       this.ghost.count = ghostN;
       this.solid.instanceMatrix.needsUpdate = true;
       this.ghost.instanceMatrix.needsUpdate = true;
       this.solid.instanceColor.needsUpdate = true;
       this.ghost.instanceColor.needsUpdate = true;
       solidGlow.needsUpdate = true;
       ghostGlow.needsUpdate = true;
     }

     this.letterCount = letterN;
    this.letterGeometry.instanceCount = letterN;
    this._aOffset.needsUpdate = true;
    this._aUv.needsUpdate = true;
    this._aColor.needsUpdate = true;
    this._aAlpha.needsUpdate = true;
    this._aScale.needsUpdate = true;
  }

  dispose() {
    this.solid.geometry.dispose();
    this.ghost.geometry.dispose();
    this.solid.material.dispose();
    this.ghost.material.dispose();
    this.letterGeometry.dispose();
    this.letters.material.dispose();
    this.atlas.texture.dispose();
    this.group.clear();
  }
}

export default CubeField;