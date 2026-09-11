import * as THREE from 'three';
import { MapBuilder, TILE, FLOOR_H, worldPos } from './MapBuilder.js';
import { EntityRenderer } from './EntityRenderer.js';
import { HazardRenderer } from './HazardRenderer.js';
import { FogOfWarOverlay } from './FogOfWarOverlay.js';
import { keyOf } from '../spatial/Tile.js';

const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize(); // true isometric: 45° azimuth, ~35.26° elevation
const CAM_DIST = 90;
const PATH_POOL = 48;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Three.js isometric tactical view. Emits TILE_HOVERED / TILE_CLICKED / VIEW_FLOOR_CHANGED,
 * listens for PATH_PREVIEW. Drag pans, wheel zooms, one floor is viewed at a time.
 */
export class SceneRenderer {
  constructor(container, state, eventBus) {
    this.container = container;
    this.state = state;
    this.bus = eventBus;
    this.scene = new THREE.Scene();
    this.viewFloor = state.player.position.z;
    this._lastPlayerZ = this.viewFloor;
    this.frustum = 10;
    this.camTarget = new THREE.Vector3();
    this._ptr = { down: false, dragging: false, sx: 0, sy: 0, button: 0, ground: null };
    this._hoverKey = null;
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._tmpV = new THREE.Vector3();
    this._offs = [];
    this._dom = [];
  }

  async init() {
    const { width, height } = this._size();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.map = new MapBuilder(this.scene, this.state);
    this.fog = new FogOfWarOverlay(this.map, this.state);
    this.entities = new EntityRenderer(this.scene, this.state);
    this.hazards = new HazardRenderer(this.scene, this.state);

    this._setupLighting();
    this._setupOverlays();
    this._bindDOM();
    this._offs.push(this.bus.on('PATH_PREVIEW', ({ keys }) => this.showPath(keys || [])));

    const c = this.map.center();
    this.camTarget.set(c.x, this.viewFloor * FLOOR_H, c.z);
    this._plane.constant = -this.viewFloor * FLOOR_H;
    this._updateCamera();
  }

  buildMapFromState() {
    this.map.viewFloor = this.viewFloor;
    this.map.build();
    this.syncFromState();
  }

  // ------------------------------------------------------------------ setup
  _size() {
    return { width: this.container.clientWidth || window.innerWidth, height: this.container.clientHeight || window.innerHeight };
  }

  _setupLighting() {
    this.scene.background = new THREE.Color(0x0f141c);
    this.scene.add(new THREE.AmbientLight(0xdde6f0, 0.7));
    const c = this.map.center();
    const d = this.state.grid.dimensions;
    const span = Math.max(d.x, d.y) * TILE;
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(c.x + span * 0.6, span + 12, c.z + span * 0.4);
    dir.target.position.copy(c);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.0005;
    const sc = dir.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = span * 4;
    this.scene.add(dir, dir.target);
    const fill = new THREE.DirectionalLight(0x8fb3ff, 0.35);
    fill.position.set(c.x - span, span * 0.5, c.z - span);
    this.scene.add(fill);
  }

  _setupOverlays() {
    this.hover = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.06, 1.04), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 }));
    this.hover.visible = false;
    this.scene.add(this.hover);
    this.pathMarkers = [];
    const geo = new THREE.BoxGeometry(0.34, 0.05, 0.34);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
    for (let i = 0; i < PATH_POOL; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.pathMarkers.push(m);
    }
  }

  _bindDOM() {
    const el = this.renderer.domElement;
    const add = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this._dom.push(() => target.removeEventListener(type, fn, opts)); };
    add(el, 'pointerdown', (e) => this._onPointerDown(e));
    add(el, 'pointermove', (e) => this._onPointerMove(e));
    add(el, 'pointerup', (e) => this._onPointerUp(e));
    add(el, 'pointerleave', () => { this._ptr.down = false; this._setHover(null); });
    add(el, 'wheel', (e) => this._onWheel(e), { passive: false });
    add(el, 'contextmenu', (e) => e.preventDefault());
    add(window, 'resize', () => this._onResize());
  }

  // ------------------------------------------------------------------ camera
  _updateCamera() {
    const { width, height } = this._size();
    const aspect = width / height;
    const d = this.frustum;
    this.camera.left = -d * aspect; this.camera.right = d * aspect; this.camera.top = d; this.camera.bottom = -d;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camTarget).addScaledVector(ISO_DIR, CAM_DIST);
    this.camera.lookAt(this.camTarget);
  }

  _onResize() {
    const { width, height } = this._size();
    this.renderer.setSize(width, height);
    this._updateCamera();
  }

  focusOn(coord) {
    const p = worldPos(coord);
    this.camTarget.set(p.x, this.viewFloor * FLOOR_H, p.z);
    this._updateCamera();
  }

  _setViewFloor(z) {
    this.viewFloor = z;
    this.camTarget.y = z * FLOOR_H;
    this._plane.constant = -z * FLOOR_H;
    this._updateCamera();
  }

  changeViewFloor(delta) {
    const z = clamp(this.viewFloor + delta, 0, this.state.grid.dimensions.z - 1);
    if (z === this.viewFloor) return;
    this._setViewFloor(z);
    this.syncFromState();
    this.bus.emit('VIEW_FLOOR_CHANGED', { floor: z });
  }

  // ------------------------------------------------------------------ picking & input
  _pickGround(cx, cy) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const out = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(this._plane, out) ? out : null;
  }

  _pickTile(cx, cy) {
    const g = this._pickGround(cx, cy);
    if (!g) return null;
    return this.state.grid.get(Math.round(g.x / TILE), Math.round(g.z / TILE), this.viewFloor);
  }

  _onPointerDown(e) {
    this._ptr = { down: true, dragging: false, sx: e.clientX, sy: e.clientY, button: e.button, ground: this._pickGround(e.clientX, e.clientY) };
  }

  _onPointerMove(e) {
    const p = this._ptr;
    if (p.down) {
      if (!p.dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5) { p.dragging = true; this._setHover(null); }
      if (p.dragging && p.ground) {
        const g = this._pickGround(e.clientX, e.clientY);
        if (g) { this.camTarget.add(p.ground.clone().sub(g)); this._updateCamera(); }
      }
      return;
    }
    this._setHover(this._pickTile(e.clientX, e.clientY));
  }

  _onPointerUp(e) {
    const p = this._ptr;
    if (p.down && !p.dragging && p.button === 0) {
      const tile = this._pickTile(e.clientX, e.clientY);
      if (tile) this.bus.emit('TILE_CLICKED', { key: tile.key, tile });
    }
    p.down = false;
    p.dragging = false;
  }

  _onWheel(e) {
    e.preventDefault();
    this.frustum = clamp(this.frustum * Math.exp(e.deltaY * 0.0012), 4, 36);
    this._updateCamera();
  }

  _setHover(tile) {
    const key = tile ? tile.key : null;
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    this.hover.visible = !!tile;
    if (tile) worldPos(tile.coord, 0.05, this.hover.position);
    this.bus.emit('TILE_HOVERED', { key, tile });
  }

  showPath(keys) {
    for (let i = 0; i < this.pathMarkers.length; i++) {
      const m = this.pathMarkers[i];
      const tile = i < keys.length ? this.state.grid.getByKey(keys[i]) : null;
      m.visible = !!tile && tile.coord.z === this.viewFloor;
      if (m.visible) worldPos(tile.coord, 0.08, m.position);
    }
  }

  // ------------------------------------------------------------------ state sync & frame
  isRevealed(key) {
    return !!this.state.outcome || this.state.player.visible.has(key);
  }

  /** Grid coord -> {x, y} pixels relative to the viewport, or null if not on the viewed floor. */
  projectToScreen(pos) {
    if (!this.camera || pos.z !== this.viewFloor) return null;
    const v = worldPos(pos, 1.9, this._tmpV).project(this.camera);
    if (v.z > 1) return null;
    const { width, height } = this._size();
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: this.isRevealed(keyOf(pos)) };
  }

  syncFromState() {
    if (!this.map) return;
    const s = this.state;
    const pz = s.player.position.z;
    if (pz !== this._lastPlayerZ) { this._lastPlayerZ = pz; this._setViewFloor(pz); }
    const reveal = (key) => this.isRevealed(key);
    const explored = (key) => !!s.outcome || s.player.explored.has(key) || s.player.visible.has(key);
    this.map.setViewFloor(this.viewFloor);
    this.map.syncDoors(s.meta.turnNumber);
    this.fog.update(this.viewFloor, !!s.outcome);
    this.hazards.sync(this.viewFloor, reveal, explored);
    this.entities.sync(this.viewFloor, reveal);
    if (this._hoverKey) {
      const t = s.grid.getByKey(this._hoverKey);
      if (!t || t.coord.z !== this.viewFloor) this._setHover(null);
    }
  }

  render(ts, dt = 0.016) {
    if (!this.renderer) return;
    this.map.update(dt);
    this.entities.update(dt);
    this.hazards.update(ts);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const off of this._dom) off();
    for (const off of this._offs) off();
    this._dom = []; this._offs = [];
    if (this.map) this.map.dispose();
    if (this.entities) this.entities.dispose();
    if (this.hazards) this.hazards.dispose();
    if (this.hover) { this.hover.geometry.dispose(); this.hover.material.dispose(); }
    if (this.pathMarkers && this.pathMarkers.length) { this.pathMarkers[0].geometry.dispose(); this.pathMarkers[0].material.dispose(); }
    if (this.renderer) {
      this.renderer.dispose();
      const el = this.renderer.domElement;
      if (el.parentElement) el.parentElement.removeChild(el);
    }
  }
}