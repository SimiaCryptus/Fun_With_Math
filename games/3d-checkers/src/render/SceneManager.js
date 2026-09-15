import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { updateTweens, tween, Easing } from '../core/tween.js';

export const PRESETS = {
  red: [0, 10, 18], black: [0, 10, -18], top: [0, 26, 0.01], iso: [14, 13, 14], side: [20, 5, 0],
};

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15181f);
    this.fog = new THREE.Fog(0x15181f, 40, 110);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.camera.position.set(...PRESETS.red);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 80;

    // Lights are kept as fields so themes can recolour / re-weight them live.
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2a2320, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.7);
    this.sun.position.set(10, 20, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight(0x9db4ff, 0.4);
    this.fill.position.set(-8, 6, -12);
    this.scene.add(this.fill);

    this.updaters = new Set();
    this.presetScale = 1; // camera presets are tuned for an 8-wide board
    this.last = performance.now();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  onFrame(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(now) {
    const dt = (now - this.last) / 1000;
    this.last = now;
    updateTweens(now);
    this.controls.update();
    for (const fn of this.updaters) fn(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Apply the background, fog, lighting and exposure parts of a resolved style. */
  setStyle(s) {
    const bg = new THREE.Color(s.background);
    this.scene.background.copy(bg);
    this.fog.color.copy(bg);
    this.scene.fog = s.fog ? this.fog : null;

    this.hemi.color.set(s.skyColor);
    this.hemi.groundColor.set(s.groundColor);
    this.hemi.intensity = s.ambientIntensity;
    this.sun.color.set(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.fill.color.set(s.fillColor);
    this.fill.intensity = s.fillIntensity;
    this.renderer.toneMappingExposure = s.exposure;

    const shadows = !!s.shadows;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      // Shadow support is compiled into the shaders — force a rebuild of every material.
      this.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of [].concat(o.material)) m.needsUpdate = true;
      });
    }
    this.sun.castShadow = shadows;
  }

  moveCameraTo(pos, duration = 700) {
    const s0 = new THREE.Spherical().setFromVector3(this.camera.position);
    const s1 = new THREE.Spherical().setFromVector3(new THREE.Vector3(...pos));
    let dTheta = s1.theta - s0.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    const t0 = this.controls.target.clone();
    const s = new THREE.Spherical();
    return tween({
      duration, ease: Easing.inOutQuad,
      onUpdate: (k) => {
        s.set(s0.radius + (s1.radius - s0.radius) * k, s0.phi + (s1.phi - s0.phi) * k, s0.theta + dTheta * k);
        this.camera.position.setFromSpherical(s);
        this.controls.target.copy(t0).multiplyScalar(1 - k);
        this.camera.lookAt(this.controls.target);
      },
    });
  }

  /** Scale the camera presets so bigger/smaller boards fill the view similarly. */
  setBoardScale(k) { this.presetScale = Math.max(0.3, +k || 1); }

  setPreset(name) {
    if (PRESETS[name]) return this.moveCameraTo(PRESETS[name].map((v) => v * this.presetScale));
  }

  flip() {
    const p = this.camera.position;
    return this.moveCameraTo([-p.x, p.y, -p.z], 900);
  }
}