import * as THREE from 'three/webgpu';

export const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4',
  '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9a6324'];

export function ribbonMaterial(color) {
   return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.38, metalness: 0.08, side: THREE.DoubleSide });
}

export function setOpacity(mat, o) {
  mat.transparent = o < 1;
  mat.opacity = o;
  mat.depthWrite = o >= 1;
  mat.needsUpdate = true;
}