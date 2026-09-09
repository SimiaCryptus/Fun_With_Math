import * as THREE from 'three';
import { clamp01, lerp } from '../core/MathX.js';

/**
 * Cartoon truck rig: velocity-aligned squash & stretch, bulging eyes, flapping tongue,
 * screaming grill. Reads only `body` state + `body.fx` (physics is never affected).
 */
export class VehicleRig {
  constructor(scene, { color = 0xb4471f, isPlayer = false } = {}) {
    this.isPlayer = isPlayer;
    this.root = new THREE.Group();
    this.stretchGroup = new THREE.Group();     // scaled non-uniformly
    this.root.add(this.stretchGroup);

    const bodyGeo = new THREE.BoxGeometry(2.7, 1.5, 4.8);
    bodyGeo.translate(0, 0.95, 0);
    this.baseColor = new THREE.Color(color);
    this.mudColor = new THREE.Color(0x3a2a12);
    this.mat = new THREE.MeshToonMaterial({ color });
    this.body = new THREE.Mesh(bodyGeo, this.mat);
     this.body.castShadow = true;
    this.stretchGroup.add(this.body);

    // inverted-hull outline (cheap, reliable, very cartoon)
    this.outline = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({
      color: 0x120c05, side: THREE.BackSide
    }));
    this.outline.scale.setScalar(1.06);
    this.stretchGroup.add(this.outline);

    // eyes
    const eyeGeo = new THREE.SphereGeometry(0.42, 16, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
    const pupGeo = new THREE.SphereGeometry(0.18, 12, 10);
    const pupMat = new THREE.MeshBasicMaterial({ color: 0x0b0700 });
    this.eyes = [];
    for (const sx of [-0.75, 0.75]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(sx, 1.85, 1.9);
      const p = new THREE.Mesh(pupGeo, pupMat);
      p.position.set(0, 0, 0.3);
      e.add(p);
     e.castShadow = true;
      this.stretchGroup.add(e);
      this.eyes.push({ mesh: e, pupil: p, baseX: sx });
    }

    // tongue
    const tongueGeo = new THREE.PlaneGeometry(0.9, 2.4, 1, 6);
    tongueGeo.translate(0, 0, 1.2);
    this.tongue = new THREE.Mesh(tongueGeo, new THREE.MeshToonMaterial({
      color: 0xd8557a, side: THREE.DoubleSide
    }));
    this.tongue.position.set(0, 0.75, 2.3);
    this.tongue.rotation.x = -Math.PI / 2.4;
    this.tongue.visible = false;
    this.stretchGroup.add(this.tongue);

    // wheels
    const wGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.6, 14);
    wGeo.rotateZ(Math.PI / 2);
    const wMat = new THREE.MeshToonMaterial({ color: 0x2a1d0c });
    this.wheels = [];
    for (const [x, z] of [[-1.35, 1.6], [1.35, 1.6], [-1.35, -1.6], [1.35, -1.6]]) {
      const w = new THREE.Mesh(wGeo, wMat);
      w.position.set(x, 0.72, z);
     w.castShadow = true;
      this.stretchGroup.add(w);
      this.wheels.push(w);
    }

    scene.add(this.root);
  }

  /** @param {number} alpha interpolation factor from the loop */
  update(body, dt) {
    this.root.position.set(body.pos.x, body.pos.y, body.pos.z);
    this.root.rotation.y = body.yaw;

    const strain = body.instability;
    const snap = body.fx.snapImpulse;

    // squash & stretch along local forward (Z), conserve volume on X/Y
    const stretch = 1 + 0.35 * strain + 0.55 * snap;
    const cross = 1 / Math.sqrt(stretch);
    this.stretchGroup.scale.set(cross * (1 + 0.25 * snap), cross, stretch);

    // frame vibration at high strain
    const t = performance.now() * 0.001;
    const vib = strain * 0.06 + snap * 0.12;
    this.stretchGroup.position.set(
      Math.sin(t * 61) * vib, Math.abs(Math.sin(t * 47)) * vib, Math.sin(t * 53) * vib
    );

    // eyes bulge with strain, pupils shoved by lateral G
    const bulge = 1 + 1.6 * strain + 1.2 * snap;
    for (const e of this.eyes) {
      e.mesh.scale.setScalar(bulge);
      e.mesh.position.z = 1.9 + 0.5 * strain;
      e.pupil.position.x = lerp(e.pupil.position.x, -body.slip * 0.28 * Math.sign(body.yawRate || 1), 0.3);
    }

    // tongue flaps when sliding
    this.tongue.visible = body.slip > 0.35;
    if (this.tongue.visible) {
      this.tongue.rotation.z = Math.sin(t * 18) * 0.6 * body.slip;
      this.tongue.rotation.x = -Math.PI / 2.4 + Math.sin(t * 13) * 0.2;
    }

    // scream: vertical spike right after a snapback
    const scream = clamp01(body.fx.screamT / 0.45);
    this.body.scale.y = 1 + 0.5 * scream;

    const spin = body.fx.wheelSpin;
    for (const w of this.wheels) w.rotation.x = -spin;

    // muddier = darker. Lerp from the stored base each frame: the previous version
    // lerped the live colour cumulatively, so every truck drifted permanently brown.
    this.mat.color.copy(this.baseColor).lerp(this.mudColor, clamp01(body.mudLoad) * 0.6);
  }
}