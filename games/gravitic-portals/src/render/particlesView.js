import * as THREE from 'three';

export class ParticlesView {
  constructor(scene, max = 2000) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** alpha ∈ [0,1): interpolation between previous and current step (skipped on teleport). */
  update(world, alpha) {
    let i = 0;
    for (const p of world.particles) {
      if (i >= this.max) break;
      const teleported = p.lastCrossStep === world.stepCount;
      const a = teleported ? 1 : alpha;
      const x = p.prevPos.x + (p.pos.x - p.prevPos.x) * a;
      const y = p.prevPos.y + (p.pos.y - p.prevPos.y) * a;
      const z = p.prevPos.z + (p.pos.z - p.prevPos.z) * a;
      this.positions.set([x, y, z], 3 * i);
      const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      const t = Math.min(1, speed / 8);
      this.colors.set(p.crossings > 0 ? [1, 0.4 + 0.6 * (1 - t), 0.3] : [0.6 + 0.4 * t, 0.9, 1], 3 * i);
      i++;
    }
    this.geometry.setDrawRange(0, i);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}