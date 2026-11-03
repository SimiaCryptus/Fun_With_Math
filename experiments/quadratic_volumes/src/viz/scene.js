import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0e10);
  const camera = new THREE.PerspectiveCamera(
    50, container.clientWidth / container.clientHeight, 0.01, 100
  );
  camera.position.set(2.0, 1.6, 2.2);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.5, 0.5, 0.5);
  controls.update();

  // unit-cube frame
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0x4a4a58 })
  );
  frame.position.set(0.5, 0.5, 0.5);
  scene.add(frame);
  scene.add(new THREE.AxesHelper(0.25));

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  addEventListener('resize', resize);

  (function loop() {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  })();

  return { scene, camera, renderer, controls, THREE };
}