import * as THREE from 'three';
/** three.js setup: orthographic plan camera rendering a DataTexture quad (§8.1 plan view). */
export class Renderer {
  constructor(canvas, Nx, Ny) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10); this.camera.position.z = 1;
    this.mesh = null; this.setGrid(Nx, Ny); this.resize();
  }
  setGrid(Nx, Ny) {
    const tex = new THREE.DataTexture(new Uint8Array(Nx * Ny * 4), Nx, Ny, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    if (!this.mesh) { this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex })); this.scene.add(this.mesh); }
    else { this.mesh.material.map?.dispose(); this.mesh.material.map = tex; this.mesh.material.needsUpdate = true; }
    this.texture = tex;
  }
  upload(data) { this.texture.image.data.set(data); this.texture.needsUpdate = true; }
  resize() { const w = this.canvas.clientWidth || 2, h = this.canvas.clientHeight || 1; this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.renderer.setSize(w, h, false); }
  render() { this.renderer.render(this.scene, this.camera); }
  screenshot() { return this.canvas.toDataURL('image/png'); }
  dispose() { this.texture?.dispose(); this.mesh?.geometry.dispose(); this.mesh?.material.dispose(); this.renderer.dispose(); }
}