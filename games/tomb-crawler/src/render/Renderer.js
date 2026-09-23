import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class Renderer {
  constructor(host) {
    const gl = (this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.VIEW.maxPixelRatio));
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    host.appendChild(gl.domElement);

    const scene = (this.scene = new THREE.Scene());
    const bg = new THREE.Color(0x140b05);
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, CONFIG.VIEW.fogNear, CONFIG.VIEW.fogFar);

    this.persp = new THREE.PerspectiveCamera(CONFIG.CAMERA.fov, 1, 0.1, 200);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera = this.persp;

    scene.add(new THREE.HemisphereLight(0xffd9a0, 0x1a0e06, 0.55));
    const moon = new THREE.DirectionalLight(0x8a96b8, 0.35);
    moon.position.set(-5, 10, 3);
    scene.add(moon);

    this.torch = new THREE.PointLight(0xffa850, 16, 20, 1);
    scene.add(this.torch);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 16, 1.2);
    scene.add(this.flashLight);
    this.fireLight = new THREE.PointLight(0xff6a20, 0, 10, 1.2);
    scene.add(this.fireLight);

    this.target = new THREE.Vector3();
    this.shakeAmt = 0;
    this.flashT = 0;
    this.aspect = 1;
    this._v = new THREE.Vector3();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setMode(mode) { this.camera = mode === 'ortho' ? this.ortho : this.persp; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h);
    this.aspect = w / h;
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    const H = CONFIG.CAMERA.orthoHeight * (this.aspect < 1 ? 1.35 : 1);
    this.ortho.left = (-H * this.aspect) / 2;
    this.ortho.right = (H * this.aspect) / 2;
    this.ortho.top = H / 2;
    this.ortho.bottom = -H / 2;
    this.ortho.updateProjectionMatrix();
  }

  follow(x, z, dirX, dirZ, dt, snap = false) {
    const C = CONFIG.CAMERA;
    const tx = x + dirX * C.lookAhead, tz = z + dirZ * C.lookAhead;
    const k = snap ? 1 : 1 - Math.exp(-dt * C.damping);
    this.target.x += (tx - this.target.x) * k;
    this.target.z += (tz - this.target.z) * k;
    const tilt = (C.tilt * Math.PI) / 180;
    const D = C.distance * (this.aspect < 1 ? 1.35 : 1);
    let sx = 0, sy = 0;
    if (this.shakeAmt > 0.001) {
      sx = (Math.random() - 0.5) * this.shakeAmt;
      sy = (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 8);
    }
    this.camera.position.set(this.target.x + sx, D * Math.cos(tilt) + sy, this.target.z + D * Math.sin(tilt));
    this.camera.lookAt(this.target.x + sx * 0.5, 0, this.target.z);
  }

  setTorch(x, z, t) {
    this.torch.position.set(x, 2.6, z);
    this.torch.intensity = 16 * (0.92 + 0.05 * Math.sin(t * 13) + 0.03 * Math.sin(t * 29));
  }

  addShake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  flash(x, z, color = 0xffb060) {
    this.flashLight.position.set(x, 2, z);
    this.flashLight.color.set(color);
    this.flashT = 1;
  }

  project(x, y, z) {
    const v = this._v.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  render(dt) {
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt * 3.5);
    this.flashLight.intensity = 70 * this.flashT * this.flashT;
    this.gl.render(this.scene, this.camera);
  }
}