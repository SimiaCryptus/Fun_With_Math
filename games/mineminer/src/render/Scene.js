import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getTextures } from './textures.js';

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Renderer, scene, lights, camera rig, steel vault, camera tween + shake. */
export class SceneRig {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c11);
    this.scene.fog = new THREE.FogExp2(0x0a0c11, 0.01);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.camera.position.set(10, 12, 14);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: -1 };
    this.controls.maxPolarAngle = Math.PI * 0.9;

    this.hemi = new THREE.HemisphereLight(0x8fa3c7, 0x3a2a1a, 0.55);
    this.dir = new THREE.DirectionalLight(0xfff1dd, 1.7);
    this.dir.castShadow = true;
    this.dir.shadow.mapSize.set(2048, 2048);
    this.dir.shadow.bias = -0.0005;
    this.dir.shadow.normalBias = 0.02;
    this.warm = new THREE.PointLight(0xff9a3c, 25, 40, 2);
    this.scene.add(this.hemi, this.dir, this.dir.target, this.warm);

    this.vault = null;
    this.tween = null;
    this.shakeAmt = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setEffects(level) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(level === 'low' ? 1 : level === 'med' ? 1.5 : 2, dpr));
    this.dir.castShadow = level !== 'low';
    const size = level === 'high' ? 4096 : 2048;
    if (this.dir.shadow.mapSize.x !== size) {
      this.dir.shadow.mapSize.set(size, size);
      this.dir.shadow.map?.dispose();
      this.dir.shadow.map = null;
    }
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildVault(grid) {
    if (this.vault) {
      this.scene.remove(this.vault);
      this.vault.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.map?.dispose?.();
          o.material.dispose();
        }
      });
    }
    const { width: w, depth: d, height: h } = grid;
    const tex = getTextures();
    const g = new THREE.Group();

    const floorTex = tex.steel.clone();
    floorTex.repeat.set(w + 1, d + 1);
    floorTex.needsUpdate = true;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w + 1, 1, d + 1),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.6 }),
    );
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    g.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      map: tex.steel, roughness: 0.5, metalness: 0.7, transparent: true, opacity: 0.32, depthWrite: false,
    });
    const walls = [
      [w + 1, 0.5, 0, -(d / 2 + 0.25)],
      [w + 1, 0.5, 0, d / 2 + 0.25],
      [0.5, d, -(w / 2 + 0.25), 0],
      [0.5, d, w / 2 + 0.25, 0],
    ];
    for (const [sx, sz, x, z] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), wallMat);
      wall.position.set(x, h / 2, z);
      g.add(wall);
    }

    // "Lifted lid": the ceiling is drawn as a steel outline so the orbit view can see in.
    const lid = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 1, 0.3, d + 1)),
      new THREE.LineBasicMaterial({ color: 0x6b7280 }),
    );
    lid.position.y = h + 0.15;
    g.add(lid);

    this.scene.add(g);
    this.vault = g;

    const R = Math.max(w, d);
    this.dir.position.set(w * 0.5, h + 14, d * 0.35);
    this.dir.target.position.set(0, h / 2, 0);
    const cam = this.dir.shadow.camera;
    cam.left = cam.bottom = -(R * 0.8 + 2);
    cam.right = cam.top = R * 0.8 + 2;
    cam.near = 1;
    cam.far = 60;
    cam.updateProjectionMatrix();
    this.warm.position.set(0, 0.3, 0);
    this.scene.fog.density = Math.min(0.012, 0.25 / (R + 8));
  }

  frameBoard(grid, animate = false) {
    const R = Math.max(grid.width, grid.depth);
    const pos = new THREE.Vector3(R * 0.55, grid.height + R * 0.8, R * 1.05);
    const target = new THREE.Vector3(0, grid.height / 2, 0);
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = R * 4 + 10;
    if (animate) {
      this.tweenTo(pos, target, 0.7);
    } else {
      this.tween = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.controls.update();
    }
  }

  tweenTo(pos, target, dur = 0.6) {
    this.tween = {
      from: this.camera.position.clone(),
      to: pos.clone(),
      fromT: this.controls.target.clone(),
      toT: target.clone(),
      t: 0,
      dur,
    };
  }

  shake(intensity) {
    this.shakeAmt = Math.max(this.shakeAmt, intensity);
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = easeInOut(tw.t);
      this.camera.position.lerpVectors(tw.from, tw.to, k);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      this.camera.lookAt(this.controls.target);
      if (tw.t >= 1) {
        this.tween = null;
        this.controls.update();
      }
    } else if (this.controls.enabled) {
      this.controls.update();
    }
    if (this.shakeAmt > 0.002) {
      const a = this.shakeAmt;
      this.scene.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      this.shakeAmt *= Math.pow(0.01, dt);
    } else if (this.scene.position.lengthSq() > 0) {
      this.scene.position.set(0, 0, 0);
      this.shakeAmt = 0;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}