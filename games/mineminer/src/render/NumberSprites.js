import * as THREE from 'three';
import { cellCenter } from './layout.js';

const VERT = /* glsl */ `
  attribute vec2 aUv;
  attribute vec3 aColor;
  attribute float aAlpha;
  uniform vec2 uUvScale;
  uniform float uSize;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vUv = aUv + uv * uUvScale;
    vColor = aColor;
    vAlpha = aAlpha;
    // Billboard: place the quad in view space around the instance's centre.
    vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float s = instanceMatrix[0][0];
    centre.xy += position.xy * uSize * s;
    gl_Position = projectionMatrix * centre;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vAlpha;
    if (a < 0.03) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _uv = [0, 0];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Billboarded digit quads, one instanced draw call, sampling the DigitAtlas. */
export class NumberSprites {
  constructor(scene, grid, atlas) {
    this.scene = scene;
    this.grid = grid;
    this.atlas = atlas;
    const n = grid.cellCount;
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.aUv = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
    this.geometry.setAttribute('aUv', this.aUv);
    this.geometry.setAttribute('aColor', this.aColor);
    this.geometry.setAttribute('aAlpha', this.aAlpha);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: atlas.texture },
        uUvScale: { value: atlas.uvScale },
        uSize: { value: 0.66 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, HIDDEN);
    scene.add(this.mesh);
  }

  setGlyph(i, glyph, colour) {
    cellCenter(this.grid, i, _p);
    _m.makeTranslation(_p.x, _p.y, _p.z);
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.atlas.uvOffset(glyph, _uv);
    this.aUv.setXY(i, _uv[0], _uv[1]);
    this.aUv.needsUpdate = true;
    this.aColor.setXYZ(i, colour.r, colour.g, colour.b);
    this.aColor.needsUpdate = true;
  }

  hide(i) {
    this.mesh.setMatrixAt(i, HIDDEN);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setLayerFocus(layer) {
    const arr = this.aAlpha.array;
    for (let i = 0; i < arr.length; i++) arr[i] = layer < 0 || this.grid.y(i) === layer ? 1 : 0.12;
    this.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}