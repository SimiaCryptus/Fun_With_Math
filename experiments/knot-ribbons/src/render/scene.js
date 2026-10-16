import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { stripArrays } from '../geometry/ribbon.js';
import { ribbonMaterial, setOpacity } from './materials.js';

const NO_GPU_KEY = 'ribbon.noWebGPU';

/** Probe once; remember failure so the browser's "No available adapters" isn't repeated every load. */
async function wantWebGPU() {
  if (new URLSearchParams(location.search).has('webgl')) return false;
  if (!navigator.gpu) return false;
  try { if (localStorage.getItem(NO_GPU_KEY)) return false; } catch { /* private mode */ }
  let ok = false;
  try { ok = !!(await navigator.gpu.requestAdapter()); } catch { ok = false; }
  if (!ok) { try { localStorage.setItem(NO_GPU_KEY, '1'); } catch { /* ignore */ } }
  return ok;
}

export async function createScene(el) {
  const gpu = await wantWebGPU();
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: !gpu });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  el.appendChild(renderer.domElement);
  await renderer.init();
  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f15);
  scene.fog = new THREE.Fog(0x0d0f15, 14, 30);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -8.5, 6.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 25;

  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x20222c, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, -6, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fa8ff, 1.4);
  rim.position.set(-6, 7, 3);
  scene.add(rim);

  const grid = new THREE.GridHelper(16, 32, 0x2a3044, 0x1a1e2a);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -1.6;
  scene.add(grid);

  const group = new THREE.Group();
  scene.add(group);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicNodeMaterial({ color: 0xffffff }));
  marker.visible = false;
  scene.add(marker);

  const blade = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicNodeMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  blade.visible = false;
  scene.add(blade);

  const resize = () => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(el);
  resize();
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  const view = { knife: 0, explode: 0, xray: false, highlight: null };
  let model = null;

  const makeGeom = ({ position, normal }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    g.computeBoundingSphere();
    return g;
  };

  function clear() {
    if (!model) return;
    for (const mesh of [model.uncut, ...model.strands]) {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    model = null;
  }

  function placeBlade() {
    const on = model && view.knife > 0 && view.knife < 1;
    blade.visible = !!on;
    if (!on) return;
    const f = model.core[Math.min(model.segs, Math.floor(view.knife * model.segs))];
    const W = new THREE.Vector3(...f.W), O = new THREE.Vector3(...f.O);
    const T = new THREE.Vector3().crossVectors(W, O);
    blade.position.set(...f.p);
    blade.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(W, O, T));
    blade.scale.set(model.width * 1.5, 0.9, 1);
  }

  function apply() {
    if (!model) return;
    const segCut = Math.floor(view.knife * model.segs);
    model.uncut.visible = view.knife < 1;
    model.uncut.geometry.setDrawRange(segCut * model.uncut.userData.per, Infinity);
    setOpacity(model.uncut.material, view.xray ? 0.25 : 1);
    for (const mesh of model.strands) {
      const c = mesh.userData.comp;
      mesh.geometry.setDrawRange(0, segCut * mesh.userData.per);
      mesh.position.z = view.explode * 1.1 * (c - (model.k - 1) / 2);
      let o = view.xray ? 0.4 : 1;
      if (view.highlight !== null && view.highlight !== c) o = 0.12;
      setOpacity(mesh.material, o);
    }
    placeBlade();
  }

  return {
    backend,
    setModel({ layout, compOf, k, colors }) {
      clear();
      const th = layout.th ?? 0;
      const strands = layout.strands.map((S, p) => {
        const arr = stripArrays(S, layout.hwStrand, th);
        const mesh = new THREE.Mesh(makeGeom(arr), ribbonMaterial(colors[compOf[p] % colors.length]));
        mesh.userData = { strand: p, comp: compOf[p], per: arr.per };
        group.add(mesh);
        return mesh;
      });
      const ca = stripArrays(layout.core, layout.hwCore, th);
      const uncut = new THREE.Mesh(makeGeom(ca), ribbonMaterial('#d9dce6'));
      uncut.userData = { per: ca.per };
      group.add(uncut);
      model = { segs: layout.N, k, strands, uncut, core: layout.core, width: layout.width };
      view.highlight = null;
      apply();
    },
    setKnife(t) { view.knife = t; apply(); },
    setExplode(t) { view.explode = t; apply(); },
    setXray(b) { view.xray = b; apply(); },
    highlight(c) { view.highlight = c; apply(); },
    setMarker(p) {
      marker.visible = !!p;
      if (p) marker.position.set(p[0], p[1], p[2]);
    },
    pick(ev) {
      if (!model) return null;
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, camera);
      const hit = rc.intersectObjects(model.strands.filter((m) => m.geometry.drawRange.count > 0), false)[0];
      return hit ? hit.object.userData : null;
    },
    meshData() {
      if (!model) return [];
      return model.strands.map((m) => ({
        position: m.geometry.attributes.position.array,
        offset: m.position.toArray(),
        name: `strand_${m.userData.strand + 1}_comp_${m.userData.comp + 1}`,
      }));
    },
    canvas: renderer.domElement,
  };
}