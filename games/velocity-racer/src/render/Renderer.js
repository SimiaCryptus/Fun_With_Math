import * as THREE from 'three';

export class Renderer {
  constructor(canvas) {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.setClearColor(0x05040f, 1);
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setSize(w, h, false);
    return { w, h };
  }

  render(scene, camera) {
    this.gl.autoClear = true;
    this.gl.render(scene, camera);
  }
}
