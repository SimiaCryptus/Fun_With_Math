import * as THREE from 'three';
import { worldPos, disposeObject } from './MapBuilder.js';
import { keyOf } from '../spatial/Tile.js';

const ROLE_COLORS = { PLAYER: 0x38bdf8, STUDENT: 0x86efac, TEACHER: 0x818cf8, RESPONDER: 0xfbbf24, BYSTANDER: 0xd1d5db, THREAT: 0xef4444 };
const RING = { HEAVY: 0xef4444, MILD: 0xf59e0b, FROZEN: 0xa78bfa, INCAP: 0x9ca3af, CARRY: 0x38bdf8 };
const INCAP = new THREE.Color(0x6b7280);

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 24px "JetBrains Mono", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(312, ctx.measureText(text).width + 22);
  ctx.fillStyle = 'rgba(11,15,23,0.78)';
  ctx.fillRect(160 - w / 2, 10, w, 44);
  ctx.fillStyle = color;
  ctx.fillText(text, 160, 33, 300);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.6, 0.52, 1);
  sprite.position.y = 1.75;
  return sprite;
}

/** Token meshes for player, NPCs and threats with symbolic status badges (no graphic trauma) and position tweens. */
export class EntityRenderer {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.tokens = new Map();
    this.bodyGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.9, 12);
    this.headGeo = new THREE.SphereGeometry(0.2, 12, 10);
    this.ringGeo = new THREE.TorusGeometry(0.42, 0.045, 8, 24);
    this.coneGeo = new THREE.ConeGeometry(0.36, 1.1, 12);
    // 120° perception cone, flat on the floor, centred on local +Z after rotation.x = -π/2
    this.visionGeo = new THREE.CircleGeometry(4, 24, -Math.PI / 2 - Math.PI / 3, (2 * Math.PI) / 3);
  }

  _token(id, role) {
    let tok = this.tokens.get(id);
    if (tok) return tok;
    const color = ROLE_COLORS[role] || ROLE_COLORS.BYSTANDER;
    const group = new THREE.Group();
    tok = { id, role, group, color, target: new THREE.Vector3(), snap: true, label: null, labelKey: null };
    if (role === 'THREAT') {
      const body = new THREE.Mesh(this.coneGeo, new THREE.MeshLambertMaterial({ color }));
      body.rotation.x = Math.PI / 2; // tip points along local +Z
      body.position.y = 0.55;
      body.castShadow = true;
      const vision = new THREE.Mesh(this.visionGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
      vision.rotation.x = -Math.PI / 2;
      vision.position.y = 0.06;
      group.add(body, vision);
      tok.body = body;
    } else {
      const mat = new THREE.MeshLambertMaterial({ color });
      const body = new THREE.Mesh(this.bodyGeo, mat);
      body.position.y = 0.45;
      body.castShadow = true;
      const head = new THREE.Mesh(this.headGeo, mat);
      head.position.y = 1.05;
      head.castShadow = true;
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      ring.visible = false;
      group.add(body, head, ring);
      Object.assign(tok, { body, head, ring });
    }
    this.scene.add(group);
    this.tokens.set(id, tok);
    return tok;
  }

  _style(tok, { down = false, ring = null } = {}) {
    if (tok.role === 'THREAT') return;
    if (down) {
      tok.body.scale.set(1, 0.35, 1);
      tok.body.position.y = 0.16;
      tok.head.visible = false;
      tok.body.material.color.copy(INCAP);
    } else {
      tok.body.scale.set(1, 1, 1);
      tok.body.position.y = 0.45;
      tok.head.visible = true;
      tok.body.material.color.setHex(tok.color);
    }
    tok.ring.visible = !!ring;
    if (ring) tok.ring.material.color.setHex(ring);
  }

  _label(tok, text, color = '#f3f4f6') {
    const k = `${text}|${color}`;
    if (tok.labelKey === k) return;
    if (tok.label) { tok.group.remove(tok.label); disposeObject(tok.label); }
    tok.label = makeLabel(text, color);
    tok.group.add(tok.label);
    tok.labelKey = k;
  }

  sync(viewFloor, revealFn) {
    const s = this.state;
    const live = new Set();

    const p = s.player, ps = p.physicalState;
    {
      const tok = this._token('PLAYER', 'PLAYER');
      live.add('PLAYER');
      worldPos(p.position, 0, tok.target);
      tok.group.visible = p.position.z === viewFloor;
      const carrying = ps.carrying ? s.npcs.get(ps.carrying) : null;
      const badge = ps.status !== 'ACTIVE' ? ps.status : ps.exposure === 'HEAVY' ? 'DISORIENTED' : ps.slowed ? 'SLOWED' : ps.exposure === 'MILD' ? 'EXPOSED' : '';
      this._style(tok, { down: ps.status !== 'ACTIVE', ring: ps.status !== 'ACTIVE' ? RING.INCAP : carrying ? RING.CARRY : RING[ps.exposure] || null });
      this._label(tok, `You${badge ? ' · ' + badge : ''}${carrying ? ' · carrying ' + carrying.name : ''}`, '#38bdf8');
    }

    for (const npc of s.npcs.values()) {
      if (npc.status === 'EVACUATED' || npc.status === 'TAGGED' || npc.carriedBy) continue;
      const tok = this._token(npc.id, npc.role);
      live.add(npc.id);
      worldPos(npc.position, 0, tok.target);
      tok.group.visible = npc.position.z === viewFloor && revealFn(keyOf(npc.position));
      const nps = npc.physicalState;
      const inc = npc.status === 'INCAPACITATED';
      const badge = inc ? 'NEED_ASSIST' : npc.freezeTurns > 0 ? 'FROZEN' : nps.exposure === 'HEAVY' ? 'DISORIENTED' : nps.slowed ? 'SLOWED' : nps.exposure === 'MILD' ? 'EXPOSED' : '';
      this._style(tok, { down: inc, ring: inc ? RING.INCAP : npc.freezeTurns > 0 ? RING.FROZEN : RING[nps.exposure] || null });
      this._label(tok, badge ? `${npc.name} · ${badge}` : npc.name, inc ? '#9ca3af' : '#f3f4f6');
    }

    for (const t of s.hazards.threatEntities) {
      if (t.neutralized) continue;
      const tok = this._token(t.id, 'THREAT');
      live.add(t.id);
      worldPos(t.position, 0, tok.target);
      tok.group.visible = t.position.z === viewFloor && revealFn(keyOf(t.position));
      tok.group.rotation.y = Math.atan2(t.facing.dx, t.facing.dy);
      this._label(tok, `THREAT · ${t.state}`, '#ef4444');
    }

    for (const [id, tok] of this.tokens) {
      if (live.has(id)) continue;
      this.scene.remove(tok.group);
      disposeObject(tok.group);
      this.tokens.delete(id);
    }
  }

  update(dt) {
    const a = Math.min(1, dt * 9);
    for (const tok of this.tokens.values()) {
      const pos = tok.group.position;
      if (tok.snap || pos.distanceToSquared(tok.target) > 36) { pos.copy(tok.target); tok.snap = false; }
      else pos.lerp(tok.target, a);
    }
  }

  dispose() {
    for (const tok of this.tokens.values()) { this.scene.remove(tok.group); disposeObject(tok.group); }
    this.tokens.clear();
    for (const g of [this.bodyGeo, this.headGeo, this.ringGeo, this.coneGeo, this.visionGeo]) g.dispose();
  }
}