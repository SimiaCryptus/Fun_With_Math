import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createOrbitControls(camera, dom, target = { x: 0, y: 1.25, z: 0 }) {
  const c = new OrbitControls(camera, dom);
  c.enableDamping = true;
  c.target.set(target.x, target.y, target.z);
  c.update();
  return c;
}