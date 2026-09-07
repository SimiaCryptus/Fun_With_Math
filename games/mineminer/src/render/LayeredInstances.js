import * as THREE from 'three';
import { cellCenter } from './layout.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const WHITE = new THREE.Color(0xffffff);

/**
 * One InstancedMesh per board layer sharing a geometry. Per-layer materials let
 * layer isolation / x-ray change opacity without a custom shader. Hidden cells
 * get a zero-scale matrix.
 */
export class LayeredInstances {
  constructor(scene, grid, geometry, material, { shadows = false, renderOrder = 0 } = {}) {
    this.scene = scene;
    this.grid = grid;
    this.meshes = [];
    this.baseOpacity = material.opacity;
    this.alwaysTransparent = material.transparent;
     this.shadows = shadows;
     this.renderOrder = renderOrder;
    this.layerFactor = new Float32Array(grid.height).fill(1);
    this.globalFactor = 1;
    for (let y = 0; y < grid.height; y++) {
      const mesh = new THREE.InstancedMesh(geometry, material.clone(), grid.layerSize);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.renderOrder = renderOrder;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let j = 0; j < grid.layerSize; j++) {
        mesh.setMatrixAt(j, HIDDEN);
        mesh.setColorAt(j, WHITE);
      }
      scene.add(mesh);
      this.meshes.push(mesh);
    }
    material.dispose();
  }

  set(i, scale = 1, colour = null, yOffset = 0) {
    const y = this.grid.y(i);
    const mesh = this.meshes[y];
    const j = i - y * this.grid.layerSize;
    cellCenter(this.grid, i, _p);
    _p.y += yOffset;
    _s.setScalar(scale);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(j, _m);
    mesh.instanceMatrix.needsUpdate = true;
    if (colour) {
      mesh.setColorAt(j, colour);
      mesh.instanceColor.needsUpdate = true;
    }
  }

  hide(i) {
    const y = this.grid.y(i);
    const mesh = this.meshes[y];
    mesh.setMatrixAt(i - y * this.grid.layerSize, HIDDEN);
    mesh.instanceMatrix.needsUpdate = true;
  }

   /**
    * `dim` applies to layers below the focused one, `aboveDim` to layers stacked on
    * top of it — those are the ones physically between the camera and the slice you
    * asked to look at, so they fade harder.
    */
   setLayerFocus(layer, dim = 0.15, aboveDim = dim) {
     for (let y = 0; y < this.meshes.length; y++) {
       this.layerFactor[y] = layer < 0 || y === layer ? 1 : y > layer ? aboveDim : dim;
     }
     this.applyOpacity();
   }

  setGlobalFactor(f) {
    this.globalFactor = f;
    this.applyOpacity();
  }

   applyOpacity() {
     for (let y = 0; y < this.meshes.length; y++) {
       const mesh = this.meshes[y];
       const mat = mesh.material;
       const o = this.baseOpacity * this.layerFactor[y] * this.globalFactor;
       const faded = o < this.baseOpacity - 1e-3; // dimmed by layer isolate or x-ray
       mat.opacity = o;

       const transparent = this.alwaysTransparent || o < 0.999;
       if (mat.transparent !== transparent) {
         mat.transparent = transparent;
         mat.needsUpdate = true;
       }

       // A faded layer must never occlude what is behind it. Ghost cubes and digit
       // sprites are depth-TESTED, so a dimmed slab that still writes depth hides the
       // numbers of the layer you are trying to read — which is exactly what made
       // multi-layer boards (and Alt x-ray) look broken.
       const depthWrite = !this.alwaysTransparent && !faded;
       if (mat.depthWrite !== depthWrite) {
         mat.depthWrite = depthWrite;
         mat.needsUpdate = true;
       }

       // Faded blocks also stop casting/receiving shadows, otherwise an isolated
       // lower layer sits in the pitch-black shadow of the slab above it.
       mesh.castShadow = this.shadows && !faded;
       mesh.receiveShadow = this.shadows && !faded;
       mesh.renderOrder = faded ? this.renderOrder + 1 : this.renderOrder;
       mesh.visible = o > 0.005;
     }
   }

  dispose() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.material.dispose();
      mesh.dispose();
    }
    this.meshes.length = 0;
  }
}