/**
 * controls.js — minimal orbit/pan/dolly plus tap-vs-drag arbitration (§5.4).
 *
 * It owns every pointer event on the canvas and hands cube gestures to hooks:
 *   hooks.hitTest(clientX, clientY) → cube index | null
 *   hooks.onTap(index)          single click/tap on a cube
 *   hooks.onTapEmpty()          click/tap on the background
 *
* Trail-drag selection is off (it fought the orbit gesture): *every* drag
* orbits, wherever it starts, and only a tap selects. Right/middle drag pans
* anywhere, two fingers pinch-zoom + pan.
 */

import * as THREE from 'three';

const DRAG_PX = 8;
const HALF_PI = Math.PI / 2;

export class CameraControls {
  constructor(camera, dom, { reducedMotion = false } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.reducedMotion = reducedMotion;
    this.hooks = {};

    this.target = new THREE.Vector3();
    this.theta = Math.PI * 0.25;
    this.phi = Math.PI * 0.36;
    this.distance = 12;
    this.minDistance = 3;
    this.maxDistance = 60;

    this._vTheta = 0;
    this._vPhi = 0;
    this._tween = null;
    this._pointers = new Map();
    this._mode = null;
    this._down = { x: 0, y: 0, index: null, moved: false };
    this._pinch = 0;
    this._mid = { x: 0, y: 0 };
    this._scratch = new THREE.Vector3();

    this._bound = {
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      wheel: (e) => this._onWheel(e),
      menu: (e) => e.preventDefault(),
      dbl: () => this.snap('iso'),
    };
    dom.addEventListener('pointerdown', this._bound.down);
    dom.addEventListener('pointermove', this._bound.move);
    dom.addEventListener('pointerup', this._bound.up);
    dom.addEventListener('pointercancel', this._bound.up);
    dom.addEventListener('wheel', this._bound.wheel, { passive: false });
    dom.addEventListener('contextmenu', this._bound.menu);
    dom.addEventListener('dblclick', this._bound.dbl);
  }

  // -------------------------------------------------------------- gestures

  _onDown(e) {
    this._tween = null;
    this.dom.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 1) {
      this._down = { x: e.clientX, y: e.clientY, index: null, moved: false };
      if (e.button === 1 || e.button === 2) {
        this._mode = 'pan';
        return;
      }
      const hit = this.hooks.hitTest?.(e.clientX, e.clientY) ?? null;
      this._down.index = hit;
      this._mode = hit != null ? 'select' : 'orbit';
    } else if (this._pointers.size === 2) {
      this._mode = 'pinch';
      const [a, b] = [...this._pointers.values()];
      this._pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this._mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  _onMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this._mode === 'pinch' && this._pointers.size >= 2) {
      const [a, b] = [...this._pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinch > 0) this.dolly(this._pinch / Math.max(1, dist));
      this._pinch = dist;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.pan(mx - this._mid.x, my - this._mid.y);
      this._mid = { x: mx, y: my };
      return;
    }

    const far = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > DRAG_PX;

    if (this._mode === 'select') {
      if (!far) return;
      // A drag that starts on a letter orbits too; only a tap selects.
      this._down.moved = true;
      this._mode = 'orbit';
    }

    if (far) this._down.moved = true;
    if (this._mode === 'orbit') this.orbit(dx, dy);
    else if (this._mode === 'pan') this.pan(dx, dy);
  }

  _onUp(e) {
    this._pointers.delete(e.pointerId);
    this.dom.releasePointerCapture?.(e.pointerId);
    if (this._pointers.size > 0) return;

    if (this._mode === 'select') {
      if (!this._down.moved && this._down.index != null) this.hooks.onTap?.(this._down.index);
    } else if ((this._mode === 'orbit' || this._mode === 'pan') && !this._down.moved) {
      this.hooks.onTapEmpty?.();
    }
    this._mode = null;
  }

  _onWheel(e) {
    e.preventDefault();
    this.dolly(Math.exp(e.deltaY * 0.0012));
  }

  // ---------------------------------------------------------------- motion

  orbit(dx, dy) {
    const k = 0.007;
    this.theta -= dx * k;
    this.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.phi - dy * k));
    this._vTheta = -dx * k * 0.6;
    this._vPhi = -dy * k * 0.6;
  }

  dolly(factor) {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * factor));
  }

  pan(dx, dy) {
    const scale = (this.distance * 0.0022);
    const right = this._scratch.set(Math.cos(this.theta), 0, -Math.sin(this.theta));
    this.target.addScaledVector(right, -dx * scale);
    this.target.y += dy * scale;
  }

  /** 400 ms eased tween to a canned viewpoint (§5.4). */
  snap(which = 'iso', ms = 400) {
    const goals = {
      front: { theta: Math.PI * 0.5, phi: HALF_PI },
      top: { theta: Math.PI * 0.5, phi: 0.12 },
      iso: { theta: Math.PI * 0.25, phi: Math.PI * 0.36 },
    };
    const goal = goals[which] ?? goals.iso;
    if (this.reducedMotion || ms <= 0) {
      this.theta = goal.theta;
      this.phi = goal.phi;
      this.target.set(0, 0, 0);
      return;
    }
    this._tween = {
      t: 0, ms,
      from: { theta: this.theta, phi: this.phi, tx: this.target.x, ty: this.target.y, tz: this.target.z },
      to: goal,
    };
  }

  frame(radius) {
    const fov = (this.camera.fov * Math.PI) / 180;
    let d = radius / Math.sin(fov / 2);
    if (this.camera.aspect < 1) d /= Math.max(0.45, this.camera.aspect);
    this.distance = d;
    this.minDistance = radius * 0.6;
    this.maxDistance = radius * 8;
    this.target.set(0, 0, 0);
  }

  update(dt) {
    if (this._tween) {
      const tw = this._tween;
      tw.t = Math.min(1, tw.t + (dt * 1000) / tw.ms);
      const e = 1 - Math.pow(1 - tw.t, 3);
      this.theta = tw.from.theta + (tw.to.theta - tw.from.theta) * e;
      this.phi = tw.from.phi + (tw.to.phi - tw.from.phi) * e;
      this.target.set(tw.from.tx * (1 - e), tw.from.ty * (1 - e), tw.from.tz * (1 - e));
      if (tw.t >= 1) this._tween = null;
    } else if (!this._mode && !this.reducedMotion) {
      // inertia
      this.theta += this._vTheta;
      this.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.phi + this._vPhi));
      const damp = Math.exp(-dt * 6);
      this._vTheta *= damp;
      this._vPhi *= damp;
    }

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.distance * sp * Math.sin(this.theta),
      this.target.y + this.distance * Math.cos(this.phi),
      this.target.z + this.distance * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }

  dispose() {
    const d = this.dom;
    d.removeEventListener('pointerdown', this._bound.down);
    d.removeEventListener('pointermove', this._bound.move);
    d.removeEventListener('pointerup', this._bound.up);
    d.removeEventListener('pointercancel', this._bound.up);
    d.removeEventListener('wheel', this._bound.wheel);
    d.removeEventListener('contextmenu', this._bound.menu);
    d.removeEventListener('dblclick', this._bound.dbl);
  }
}

export default CameraControls;