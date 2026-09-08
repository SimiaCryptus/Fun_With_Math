import * as THREE from 'three';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isTyping = e => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName);

/**
 * Damped orbit / pan / dolly rig for a board lying in the y = 0 plane.
 *
 *   drag ................ orbit        right / middle / shift+drag ... pan
 *   wheel ............... dolly toward the cursor, in small clamped steps
 *   two fingers ......... pinch to dolly, drag to pan
 *   arrows .............. pan     + / - ... dolly     R ... reset     T ... top-down
 *
 * Everything moves toward a goal with exponential damping, so a wheel notch
 * is a short glide rather than a jump between two extremes.
 */
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = true;
    this.damping = 10;
    this.rotateSpeed = 0.0045;
    this.minPhi = 0.05;
    this.maxPhi = 1.3;
    this.minDist = 1;
    this.maxDist = 100;
    this.bounds = null;
    this.home = null;

    this.target = new THREE.Vector3();
    this.dist = 10; this.theta = 0; this.phi = 0.66;
    this.goal = { target: new THREE.Vector3(), dist: 10, theta: 0, phi: 0.66 };

    this._pointers = new Map();
    this._mode = null;
    this._pinch = 0;
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._ndc = new THREE.Vector2();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._bind();
    this._apply();
  }

  /** Frame a board of `radius` around `center` (world space) and make that the home view. */
  fit(center, radius) {
    this.minDist = radius * 0.35;
    this.maxDist = radius * 8;
    this.bounds = { x0: center.x - radius, x1: center.x + radius, z0: center.z - radius, z1: center.z + radius };
    this.home = { target: center.clone(), dist: radius * 2.8, theta: 0, phi: 0.66 };
    this.reset(true);
  }

  reset(snap = false) {
    if (!this.home) return;
    const g = this.goal, h = this.home;
    g.target.copy(h.target); g.dist = h.dist; g.theta = h.theta; g.phi = h.phi;
    if (snap) {
      this.target.copy(h.target); this.dist = h.dist; this.theta = h.theta; this.phi = h.phi;
      this._apply();
    }
  }

  /** Orthographic-feeling study view: straight down, and back again. */
  toggleTopDown() {
    const top = this.goal.phi <= this.minPhi + 1e-3;
    this.goal.phi = top ? (this.home?.phi ?? 0.66) : this.minPhi;
  }

  orbit(dx, dy) {
    this.goal.theta -= dx * this.rotateSpeed;
    this.goal.phi = clamp(this.goal.phi - dy * this.rotateSpeed, this.minPhi, this.maxPhi);
  }

  /** Multiply the distance by `factor`; with a cursor position, keep the point under it fixed. */
  dolly(factor, clientX, clientY) {
    const next = clamp(this.goal.dist * factor, this.minDist, this.maxDist);
    const real = next / this.goal.dist;
    if (clientX !== undefined && this._ground(clientX, clientY, this._a)) {
      this.goal.target.lerp(this._a, 1 - real);
      this._clampTarget(this.goal.target);
    }
    this.goal.dist = next;
  }

  /** Pan so the ground point that was under (x0,y0) ends up under (x1,y1). */
  panBy(x0, y0, x1, y1) {
    if (!this._ground(x0, y0, this._a) || !this._ground(x1, y1, this._b)) return;
    this._b.sub(this._a);
    if (this._b.length() > this.dist * 2) this._b.setLength(this.dist * 2);
    this.goal.target.sub(this._b);
    this.target.sub(this._b);
    this._clampTarget(this.goal.target);
    this._clampTarget(this.target);
    this._apply();
  }

  /** Keyboard pan in screen directions (fx right, fz forward), as a fraction of the view. */
  panScreen(fx, fz) {
    const step = this.dist * 0.15;
    const s = Math.sin(this.theta), c = Math.cos(this.theta);
    this.goal.target.x += (-s * fz + c * fx) * step;
    this.goal.target.z += (-c * fz - s * fx) * step;
    this._clampTarget(this.goal.target);
  }

  update(dt) {
    const k = 1 - Math.exp(-this.damping * dt);
    this.target.lerp(this.goal.target, k);
    this.dist += (this.goal.dist - this.dist) * k;
    this.theta += (this.goal.theta - this.theta) * k;
    this.phi += (this.goal.phi - this.phi) * k;
    this._apply();
  }

  _ground(clientX, clientY, out) {
    const r = this.dom.getBoundingClientRect();
    this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    return this._ray.ray.intersectPlane(this._plane, out);
  }

  _clampTarget(v) {
    v.y = 0;
    if (!this.bounds) return;
    v.x = clamp(v.x, this.bounds.x0, this.bounds.x1);
    v.z = clamp(v.z, this.bounds.z0, this.bounds.z1);
  }

  _apply() {
    const s = Math.sin(this.phi), t = this.target;
    this.camera.position.set(
      t.x + this.dist * s * Math.sin(this.theta),
      t.y + this.dist * Math.cos(this.phi),
      t.z + this.dist * s * Math.cos(this.theta),
    );
    this.camera.lookAt(t);
  }

  _pinchDist() {
    const [p, q] = [...this._pointers.values()];
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', e => e.preventDefault());
    d.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._mode = (e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey) ? 'pan' : 'orbit';
      } else if (this._pointers.size === 2) {
        this._mode = 'pinch';
        this._pinch = this._pinchDist();
      }
    });
    d.addEventListener('pointermove', e => {
      const p = this._pointers.get(e.pointerId);
      if (!p || !this.enabled) return;
      if (this._mode === 'orbit') {
        this.orbit(e.clientX - p.x, e.clientY - p.y);
      } else if (this._mode === 'pan') {
        this.panBy(p.x, p.y, e.clientX, e.clientY);
      } else if (this._mode === 'pinch' && this._pointers.size === 2) {
        const q = [...this._pointers.values()].find(v => v !== p);
        const cx0 = (p.x + q.x) / 2, cy0 = (p.y + q.y) / 2;
        p.x = e.clientX; p.y = e.clientY;
        const cx1 = (p.x + q.x) / 2, cy1 = (p.y + q.y) / 2;
        this.panBy(cx0, cy0, cx1, cy1);
        const dist = this._pinchDist();
        if (this._pinch > 0 && dist > 0) this.dolly(this._pinch / dist, cx1, cy1);
        this._pinch = dist;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = e => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 0) this._mode = null;
      else if (this._pointers.size === 1) this._mode = 'orbit';
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    d.addEventListener('wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      // normalise line/page deltas to pixels, then clamp so one notch is one small step
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.dolly(Math.exp(clamp(dy, -120, 120) * 0.0018), e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!this.enabled || isTyping(e) || e.altKey || e.metaKey || e.ctrlKey) return;
      if (document.querySelector('dialog[open]')) return;
      switch (e.key) {
        case 'ArrowUp': this.panScreen(0, 1); break;
        case 'ArrowDown': this.panScreen(0, -1); break;
        case 'ArrowLeft': this.panScreen(-1, 0); break;
        case 'ArrowRight': this.panScreen(1, 0); break;
        case '+': case '=': this.dolly(0.8); break;
        case '-': case '_': this.dolly(1.25); break;
        case 'r': this.reset(); break;
        case 't': this.toggleTopDown(); break;
        default: return;
      }
      e.preventDefault();
    });
  }
}