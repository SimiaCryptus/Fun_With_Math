import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildChunkGeometry } from '../world/chunk.js';
import { parseChunkKey } from '../world/world.js';
import { DIRS } from '../units/pathing.js';
import { EQUIPMENT } from '../items/equipment.js';
import { SIGNS } from '../items/sign.js';

const TROOP_BASE_COLOR = 0x5fcf6a;
const WHITE = new THREE.Color(0xffffff);

function makeTroopGeometry() {
  // Lanky alien infantry: body, big-eyed head, visor (marks facing) and backpack.
  const body = new THREE.BoxGeometry(0.44, 0.55, 0.34).translate(0, 0.42, 0);
  const head = new THREE.BoxGeometry(0.34, 0.3, 0.34).translate(0, 0.88, 0);
  const visor = new THREE.BoxGeometry(0.26, 0.1, 0.08).translate(0, 0.9, 0.2);
  const pack = new THREE.BoxGeometry(0.3, 0.3, 0.14).translate(0, 0.5, -0.24);
  return mergeGeometries([body, head, visor, pack]);
}

function makeGuardGeometry() {
  // Heavier, angular garrison guard.
  const body = new THREE.BoxGeometry(0.7, 0.8, 0.5).translate(0, 0.5, 0);
  const head = new THREE.BoxGeometry(0.42, 0.36, 0.42).translate(0, 1.1, 0);
  const visor = new THREE.BoxGeometry(0.34, 0.1, 0.08).translate(0, 1.12, 0.24);
  const padL = new THREE.BoxGeometry(0.2, 0.2, 0.5).translate(-0.45, 0.85, 0);
  const padR = new THREE.BoxGeometry(0.2, 0.2, 0.5).translate(0.45, 0.85, 0);
  return mergeGeometries([body, head, visor, padL, padR]);
}
function makeTurretGeometry() {
   // Squat automated emplacement: base, pivot, head and a barrel that marks its aim.
   const base = new THREE.BoxGeometry(0.9, 0.35, 0.9).translate(0, 0.175, 0);
   const pivot = new THREE.CylinderGeometry(0.3, 0.36, 0.3, 8).translate(0, 0.5, 0);
   const head = new THREE.BoxGeometry(0.5, 0.36, 0.55).translate(0, 0.8, 0);
   const barrel = new THREE.BoxGeometry(0.14, 0.14, 0.7).translate(0, 0.82, 0.55);
   return mergeGeometries([base, pivot, head, barrel]);
}
function makeGrenadierGeometry() {
   // Guard silhouette with a shoulder-mounted launcher tube and a bulky ammo pack.
   const body = new THREE.BoxGeometry(0.6, 0.75, 0.46).translate(0, 0.48, 0);
   const head = new THREE.BoxGeometry(0.4, 0.34, 0.4).translate(0, 1.06, 0);
   const visor = new THREE.BoxGeometry(0.32, 0.1, 0.08).translate(0, 1.08, 0.23);
   const tube = new THREE.CylinderGeometry(0.11, 0.11, 0.9, 8).rotateX(Math.PI / 2).translate(0.32, 1.05, 0.1);
   const pack = new THREE.BoxGeometry(0.44, 0.5, 0.2).translate(0, 0.6, -0.32);
   return mergeGeometries([body, head, visor, tube, pack]);
}

/** Instanced rendering for many identical units (troops or guards). */
class UnitBatch {
  constructor(geometry, capacity, name) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.userData.batch = name;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  update(units, colorFn) {
    const n = Math.min(units.length, this.capacity);
     this.mesh.userData.units = units; // lets the input system map an instance id back to its unit
    for (let i = 0; i < n; i++) {
      const u = units[i];
      const f = DIRS[u.dir];
      this.dummy.position.set(u.pos.x, u.pos.y, u.pos.z);
      this.dummy.rotation.set(0, Math.atan2(f.dx, f.dz), 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      colorFn(u, this.color);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    if (n > 0) this.mesh.computeBoundingSphere(); // keeps raycasting accurate as units move
  }
}

/** Tiny CPU particle system for explosions / digging / deaths (render-side only). */
class Particles {
  constructor(capacity) {
    this.capacity = capacity;
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colAttr);
    this.geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.tmp = new THREE.Color();
  }

  burst(pos, hex, count, speed) {
    this.tmp.setHex(hex);
    for (let k = 0; k < count; k++) {
      if (this.count >= this.capacity) return;
      const i = this.count++;
      this.positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.4;
      this.positions[i * 3 + 1] = pos.y + 0.3 + (Math.random() - 0.5) * 0.4;
      this.positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.velocities[i * 3] = s * Math.sin(phi) * Math.cos(theta);
      this.velocities[i * 3 + 1] = s * Math.abs(Math.cos(phi)) + 1;
      this.velocities[i * 3 + 2] = s * Math.sin(phi) * Math.sin(theta);
      const shade = 0.8 + Math.random() * 0.2;
      this.colors[i * 3] = this.tmp.r * shade;
      this.colors[i * 3 + 1] = this.tmp.g * shade;
      this.colors[i * 3 + 2] = this.tmp.b * shade;
      this.life[i] = 0.4 + Math.random() * 0.5;
    }
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.count;
        for (let k = 0; k < 3; k++) {
          this.positions[i * 3 + k] = this.positions[last * 3 + k];
          this.velocities[i * 3 + k] = this.velocities[last * 3 + k];
          this.colors[i * 3 + k] = this.colors[last * 3 + k];
        }
        this.life[i] = this.life[last];
        continue;
      }
      this.velocities[i * 3 + 1] -= 12 * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      i++;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, this.count);
  }
}

export class Renderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a2130);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

    this.gl = new THREE.WebGLRenderer({ antialias: true });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.gl.domElement);

    this.controls = new OrbitControls(this.camera, this.gl.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.49; // never dip below the diorama
    this.controls.minDistance = 6;
    this.controls.maxDistance = 160;
    this.controls.screenSpacePanning = false;

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a3a2a, 0.9));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.world = null;
    this.chunkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.chunkMeshes = new Map();
    this.worldGroup = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.decor = new THREE.Group();
    this.scene.add(this.worldGroup, this.dynamic, this.decor);

    this.troops = new UnitBatch(makeTroopGeometry(), 512, 'troops');
     // One instanced batch per guard type so each silhouette stays readable at a glance.
     this.guardBatches = {
       sentry: new UnitBatch(makeGuardGeometry(), 128, 'guards'),
       turret: new UnitBatch(makeTurretGeometry(), 64, 'guards'),
       grenadier: new UnitBatch(makeGrenadierGeometry(), 64, 'guards'),
     };
     this.dynamic.add(this.troops.mesh, ...Object.values(this.guardBatches).map((b) => b.mesh));

    this.crateGeometry = new THREE.BoxGeometry(0.7, 0.5, 0.7);
    this.crateEdges = new THREE.EdgesGeometry(this.crateGeometry);
    this.crateMeshes = new Map();
     // Signs: post + coloured plate + arrows showing where the column goes. Projectiles: grenades.
     this.signPostGeometry = new THREE.BoxGeometry(0.08, 0.95, 0.08).translate(0, 0.475, 0);
     this.signPlateGeometry = new THREE.BoxGeometry(0.72, 0.42, 0.08).translate(0, 0.98, 0);
     this.signBarGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.12).translate(0, 0.98, 0);
     this.signArrowGeometry = new THREE.ConeGeometry(0.11, 0.36, 6).rotateX(Math.PI / 2); // points along local +z
     this.signPostMaterial = new THREE.MeshLambertMaterial({ color: 0x6b5a45 });
     this.signArrowMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
     this.signMeshes = new Map();
     this.projectileGeometry = new THREE.SphereGeometry(0.13, 8, 6);
     this.projectileMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2f38, emissive: 0x552200 });
     this.projectileMeshes = new Map();

    this.particles = new Particles(3000);
    this.dynamic.add(this.particles.points);
    this.tracers = [];

    this.cursor = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    this.cursor.visible = false;
    this.dynamic.add(this.cursor);
     this.cursorSize = new THREE.Vector3(1, 1, 1);
     // Level bounds outline (shown by the level designer).
     this.bounds = null;
     this.showBounds = false;

    this.isometric = false;
    this.elapsed = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.gl.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- world ------------------------------------------------------------------

   setWorld(world, { resetCamera = true } = {}) {
    for (const mesh of this.chunkMeshes.values()) {
      this.worldGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunkMeshes.clear();
    this.world = world;
     world.markAllDirty(); // (re)build every chunk mesh, even if this world object was shown before
     if (this.bounds) {
       this.dynamic.remove(this.bounds);
       this.bounds.geometry.dispose();
     }
     this.bounds = new THREE.LineSegments(
       new THREE.EdgesGeometry(new THREE.BoxGeometry(world.w, world.h, world.d)),
       new THREE.LineBasicMaterial({ color: 0x7fa0d0, transparent: true, opacity: 0.55 }),
     );
     this.bounds.position.set(world.w / 2, world.h / 2, world.d / 2);
     this.bounds.visible = this.showBounds;
     this.dynamic.add(this.bounds);

    const cx = world.w / 2, cy = world.h / 3, cz = world.d / 2;
     if (resetCamera) {
       this.controls.target.set(cx, cy, cz);
       this.camera.position.set(cx - world.w * 0.2, world.h * 1.4 + 8, cz + world.d * 1.7);
     }
    this.sun.position.set(cx + world.w * 0.5, world.h + world.w * 0.6, cz + world.d * 0.8);
    this.sun.target.position.set(cx, 0, cz);
    const r = Math.max(world.w, world.d) * 0.8;
    const sc = this.sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 300;
    sc.updateProjectionMatrix();
     if (this.isometric && resetCamera) this.applyIsometric();
    this.controls.update();
  }
   setBoundsVisible(on) {
     this.showBounds = on;
     if (this.bounds) this.bounds.visible = on;
   }

  setupLevel(sim) {
    this.decor.clear();
    for (const [, m] of this.crateMeshes) this.dynamic.remove(m);
    this.crateMeshes.clear();
     for (const [, g] of this.signMeshes) {
       this.dynamic.remove(g);
       g.userData.plate.material.dispose();
     }
     this.signMeshes.clear();
     for (const [, m] of this.projectileMeshes) this.dynamic.remove(m);
     this.projectileMeshes.clear();
    for (const t of this.tracers) this.dynamic.remove(t.line);
    this.tracers.length = 0;

    // Drop pod hovering over the spawn cell.
    const s = sim.spawn;
    const pod = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.5, 1.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x8fd3ff, emissive: 0x1a3a55 }),
    );
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0xdff3ff }));
    nose.position.y = 1.05;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.position.y = -2.18;
    pod.add(hull, nose, ring);
    pod.position.set(s.x + 0.5, s.y + 2.2, s.z + 0.5);
    hull.castShadow = true;
    this.decor.add(pod);
     // Objective zone: translucent golden box over the cells troops must reach.
     const o = sim.objective;
     if (o && o.type === 'reach') {
       const size = [0, 1, 2].map((i) => o.to[i] - o.from[i] + 1);
       const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
       const zone = new THREE.Mesh(
         geo,
         new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.12, depthWrite: false }),
       );
       zone.add(new THREE.LineSegments(
         new THREE.EdgesGeometry(geo),
         new THREE.LineBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.7 }),
       ));
       zone.position.set(o.from[0] + size[0] / 2, o.from[1] + size[1] / 2, o.from[2] + size[2] / 2);
       this.decor.add(zone);
     }
  }

  syncWorld(world) {
    for (const key of world.consumeDirty()) this.rebuildChunk(key);
  }

  rebuildChunk(key) {
    const old = this.chunkMeshes.get(key);
    if (old) {
      this.worldGroup.remove(old);
      old.geometry.dispose();
      this.chunkMeshes.delete(key);
    }
    const [cx, cy, cz] = parseChunkKey(key);
    const geometry = buildChunkGeometry(this.world, cx, cy, cz);
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, this.chunkMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);
    this.chunkMeshes.set(key, mesh);
  }

  // ---- units, crates, effects ---------------------------------------------------

  syncUnits(sim) {
    this.troops.update(sim.troops, (t, color) => {
      const base = t.role ? t.role.color : t.equipment ? EQUIPMENT[t.equipment].color : TROOP_BASE_COLOR;
      color.setHex(base);
      if (t.flash > 0) color.lerp(WHITE, t.flash * 0.8);
    });
     for (const [type, batch] of Object.entries(this.guardBatches)) {
       batch.update(sim.guards.filter((g) => g.type === type), (g, color) => {
         color.setHex(g.def.color);
         if (g.flash > 0) color.lerp(WHITE, g.flash * 0.8);
       });
     }
    this.syncCrates(sim.crates);
     this.syncSigns(sim.signs);
     this.syncProjectiles(sim.projectiles);
  }

  syncCrates(crates) {
    const seen = new Set();
    for (const c of crates) {
      seen.add(c.id);
      let mesh = this.crateMeshes.get(c.id);
      if (!mesh) {
        const color = EQUIPMENT[c.kind].color;
        mesh = new THREE.Mesh(this.crateGeometry, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
        mesh.add(new THREE.LineSegments(this.crateEdges, new THREE.LineBasicMaterial({ color: 0x222222 })));
        mesh.castShadow = true;
        mesh.position.set(c.x + 0.5, c.y + 0.25, c.z + 0.5);
        this.dynamic.add(mesh);
        this.crateMeshes.set(c.id, mesh);
      }
      const fill = c.remaining / c.capacity;
      mesh.scale.setScalar(0.7 + 0.3 * fill);
      mesh.position.y = c.y + 0.25 + Math.sin(this.elapsed * 3 + c.id) * 0.04;
    }
    for (const [id, mesh] of this.crateMeshes) {
      if (!seen.has(id)) {
        this.dynamic.remove(mesh);
        mesh.material.dispose();
        this.crateMeshes.delete(id);
      }
    }
  }
   makeSignMesh(sign) {
     const def = SIGNS[sign.kind];
     const group = new THREE.Group();
     const post = new THREE.Mesh(this.signPostGeometry, this.signPostMaterial);
     const plate = new THREE.Mesh(
       this.signPlateGeometry,
       new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.3 }),
     );
     plate.castShadow = true;
     post.userData.signId = plate.userData.signId = sign.id;
     group.add(post, plate);
     if (def.bar) group.add(new THREE.Mesh(this.signBarGeometry, this.signArrowMaterial));
     for (const a of def.arrows) {
       const arrow = new THREE.Mesh(this.signArrowGeometry, this.signArrowMaterial);
       arrow.position.set(a.ox ?? 0, 1.32, 0);
       arrow.rotation.y = a.yaw;
       group.add(arrow);
     }
     group.userData.plate = plate;
     group.userData.pickables = [post, plate];
     return group;
   }
   syncSigns(signs) {
     const seen = new Set();
     for (const s of signs) {
       seen.add(s.id);
       let group = this.signMeshes.get(s.id);
       if (!group) {
         group = this.makeSignMesh(s);
         group.position.set(s.x + 0.5, s.y, s.z + 0.5);
         this.dynamic.add(group);
         this.signMeshes.set(s.id, group);
       }
       const f = DIRS[s.dir];
       group.rotation.y = Math.atan2(f.dx, f.dz); // plate faces the incoming column, like unit visors
     }
     for (const [id, group] of this.signMeshes) {
       if (!seen.has(id)) {
         this.dynamic.remove(group);
         group.userData.plate.material.dispose();
         this.signMeshes.delete(id);
       }
     }
   }
   syncProjectiles(projectiles) {
     const seen = new Set();
     for (const p of projectiles) {
       seen.add(p.id);
       let mesh = this.projectileMeshes.get(p.id);
       if (!mesh) {
         mesh = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
         mesh.castShadow = true;
         this.dynamic.add(mesh);
         this.projectileMeshes.set(p.id, mesh);
       }
       mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
     }
     for (const [id, mesh] of this.projectileMeshes) {
       if (!seen.has(id)) {
         this.dynamic.remove(mesh);
         this.projectileMeshes.delete(id);
       }
     }
   }

  consumeEvents(events) {
    for (const ev of events) {
      switch (ev.type) {
         case 'tracer': this.addTracer(ev.from, ev.to, ev.color ?? 0xfff3a0); break;
        case 'hit': this.particles.burst(ev.pos, 0xffffff, 6, 2); break;
        case 'death': this.particles.burst(ev.pos, 0x77ff77, 22, 4); break;
        case 'guardDead': this.particles.burst(ev.pos, 0xff5555, 40, 5); break;
        case 'dig': this.particles.burst(ev.pos, 0xa0703a, 16, 3); break;
        case 'build': this.particles.burst(ev.pos, 0xe0b060, 10, 2); break;
        case 'saved': this.particles.burst(ev.pos, 0xffe066, 18, 3); break;
        case 'spawn': this.particles.burst(ev.pos, 0x8fd3ff, 8, 2); break;
        case 'land': this.particles.burst(ev.pos, 0x9a8a70, 5, 1.5); break;
         case 'explosion':
           this.particles.burst(ev.pos, 0xff8a3c, 40, 5);
           this.particles.burst(ev.pos, 0x444444, 14, 2.5);
           break;
        case 'pickup':
        case 'crate':
         case 'sign':
         case 'pickupSign':
        case 'role': this.particles.burst(ev.pos, ev.color ?? 0xffffff, 12, 2); break;
        default: break;
      }
    }
  }

  addTracer(from, to, hex) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 1 }));
    this.dynamic.add(line);
    this.tracers.push({ line, ttl: 0.18, max: 0.18 });
  }

   /** Highlight one cell, or the box spanning `cell`..`to` when `to` is given. */
   setCursor(cell, hex, to = null) {
    if (!cell) { this.cursor.visible = false; return; }
     const b = to || cell;
     const x0 = Math.min(cell.x, b.x), y0 = Math.min(cell.y, b.y), z0 = Math.min(cell.z, b.z);
     this.cursorSize.set(Math.abs(cell.x - b.x) + 1, Math.abs(cell.y - b.y) + 1, Math.abs(cell.z - b.z) + 1);
    this.cursor.visible = true;
     this.cursor.position.set(x0 + this.cursorSize.x / 2, y0 + this.cursorSize.y / 2, z0 + this.cursorSize.z / 2);
    this.cursor.material.color.setHex(hex ?? 0xffffff);
  }

  // ---- camera -------------------------------------------------------------------

  setIsometric(on) {
    this.isometric = on;
    if (on) {
      this.applyIsometric();
    } else {
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
      this.controls.enableRotate = true;
    }
  }

  applyIsometric() {
    if (!this.world) return;
    const dist = Math.max(this.world.w, this.world.d) * 2.2;
    const dir = new THREE.Vector3(1, 1, 1).normalize(); // true isometric elevation (~35°)
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.camera.fov = 22;
    this.camera.updateProjectionMatrix();
    this.controls.enableRotate = false;
  }

  // ---- frame ----------------------------------------------------------------------

  update(dt) {
    this.elapsed += dt;
    this.controls.update();
    this.particles.update(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.ttl -= dt;
      if (t.ttl <= 0) {
        this.dynamic.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = t.ttl / t.max;
      }
    }
    if (this.cursor.visible) {
      const s = 1 + Math.sin(this.elapsed * 6) * 0.03;
       this.cursor.scale.set(this.cursorSize.x * s, this.cursorSize.y * s, this.cursorSize.z * s);
    }
  }

  render() {
    this.gl.render(this.scene, this.camera);
  }

  /** Objects the input system may raycast against. */
  pickables() {
     const list = [...this.chunkMeshes.values(), this.troops.mesh, ...Object.values(this.guardBatches).map((b) => b.mesh)];
     for (const g of this.signMeshes.values()) list.push(...g.userData.pickables);
     return list;
  }
}