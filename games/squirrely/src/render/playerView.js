import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

/** Low-poly squirrel; interpolated hop, crouch flatten, squash, hollow shrink (SPEC §16.6). */
export class PlayerView {
  constructor(scene) {
    this.group = new THREE.Group();
    this.mesh = new THREE.Group();
    this.group.add(this.mesh);
    scene.add(this.group);

    const fur = new THREE.MeshLambertMaterial({ color: 0x9a5b2b });
    const belly = new THREE.MeshLambertMaterial({ color: 0xd9b48a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x141414 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), fur);
    body.scale.set(1, 0.85, 1.35); body.position.y = 0.2;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), belly);
    chest.position.set(0, 0.16, -0.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), fur);
    head.position.set(0, 0.36, -0.26);
    const earGeo = new THREE.ConeGeometry(0.04, 0.09, 6);
    const earL = new THREE.Mesh(earGeo, fur); earL.position.set(-0.08, 0.5, -0.26);
    const earR = earL.clone(); earR.position.x = 0.08;
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, dark); eyeL.position.set(-0.07, 0.39, -0.37);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.07;
    this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), fur);
    this.tail.scale.set(0.8, 2.4, 0.9);
    this.tail.position.set(0, 0.42, 0.26);
    this.tail.rotation.x = -0.35;

     // whatever is in the mouth (acorn or smoke bomb) — grows when carrying two, darkens when a smoke bomb is aboard
    this.held = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshLambertMaterial({ color: 0xa8692e }));
    this.held.position.set(0, 0.32, -0.42);

    for (const m of [body, chest, head, earL, earR, eyeL, eyeR, this.tail, this.held]) { m.castShadow = true; this.mesh.add(m); }
  }

  update(p, alpha, time) {
    const x = lerp(p.prevX, p.x, alpha), z = lerp(p.prevZ, p.z, alpha), y = lerp(p.prevY, p.y, alpha);
    this.group.position.set(x, y, z);
    this.group.rotation.y = p.facing;

    let sy = 1, sxz = 1;
    if (p.crouched) sy = 0.5;
    if (p.state === 'squashed') { sy = 0.12; sxz = 1.5; }
    if (p.state === 'goal') { const k = clamp(p.goalTimer / 0.8, 0, 1); sy *= k; sxz *= k; }
    this.mesh.scale.set(sxz, sy, sxz);
    this.group.visible = !(p.state === 'goal' && p.goalTimer <= 0.05);

    const hopping = p.state === 'hopping' || p.state === 'nudged';
    this.mesh.rotation.x = hopping ? -0.35 * Math.sin(Math.PI * clamp(p.t / p.dur, 0, 1)) : 0;
    this.mesh.rotation.z = p.tauntAnim > 0 ? Math.sin(time * 40) * 0.25 : 0;
    this.tail.rotation.z = Math.sin(time * (hopping ? 18 : 5)) * 0.18;
    const held = p.mouth ? p.mouth.length : 0;
    this.held.visible = held > 0;
    this.held.scale.setScalar(held > 1 ? 1.4 : 1);
     if (held > 0) this.held.material.color.setHex(p.mouth.includes('smoke') ? 0x2a2d33 : 0xa8692e);
  }
}