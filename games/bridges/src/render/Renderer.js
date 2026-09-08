import * as THREE from 'three';
import { BoardMesh } from './BoardMesh.js';
import { BridgeMesh } from './BridgeMesh.js';
import { LinkMesh } from './LinkMesh.js';
import { CameraRig } from './CameraRig.js';
import { THEMES } from './Themes.js';

/** Scene, camera rig, picking and render loop.  Knows nothing about rules. */
export class Renderer {
  constructor(canvas, display = {}) {
    this.canvas = canvas;
    this.display = { theme: 'slate', borders: 'anchored', links: true, animations: true, ...display };
    this.theme = THEMES[this.display.theme] ?? THEMES.slate;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.theme.background);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    this.rig = new CameraRig(this.camera, canvas);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(6, 12, 8);
    this.scene.add(key, new THREE.HemisphereLight(0xdde6ff, 0x30281c, 0.9));

    this.table = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: this.theme.table, roughness: 0.95 }),
    );
    this.table.rotation.x = -Math.PI / 2;
    this.table.position.y = -0.01;
    this.scene.add(this.table);

    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.onPick = null;
    this.onHover = null;
    this.hover = -1;
    this.board = null;

    this._bindEvents();
    this._resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  now() { return this.clock.getElapsedTime(); }

  /** Animations are a display setting, but `prefers-reduced-motion` always wins. */
  get animate() { return this.display.animations !== false && !this.reducedMotion; }

  setBoard(board, fit = true) {
    this.board = board;
    if (this.boardMesh) { this.boardMesh.geometry.dispose(); this.boardMesh.material.dispose(); }
    if (this.bridges) this.bridges.reset();
    if (this.links) this.links.dispose();
    if (this.frame) for (const m of this.frame.children) m.geometry.dispose();
    this.boardGroup.clear();

    this.boardMesh = new BoardMesh(board, this.theme);
    this.bridges = new BridgeMesh(board, this.theme, this.boardMesh.height);
    this.links = new LinkMesh(board, this.theme, this.boardMesh.height);
    this.frame = this._buildFrame(board);
    this.boardGroup.add(this.boardMesh, this.bridges, this.links, this.frame);
    this.pickPlane.constant = -this.boardMesh.height;
    this.hover = -1;
    this._applyDisplay();
    if (fit) this._fitCamera(board);
  }

  /**
   * Apply display settings (theme, tile borders, link bars, animations).
   * A theme change rebuilds the board meshes; pass `game` so state is restored.
   */
  setDisplay(display, game) {
    const themeChanged = display.theme !== undefined && display.theme !== this.display.theme;
    this.display = { ...this.display, ...display };
    if (themeChanged) {
      this.theme = THEMES[this.display.theme] ?? THEMES.slate;
      this.scene.background.set(this.theme.background);
      this.table.material.color.set(this.theme.table);
      if (this.board) {
        this.setBoard(this.board, false);
        if (game) this.sync(game);
      }
    }
    this._applyDisplay();
  }

  _applyDisplay() {
    this.boardMesh?.setDisplay({ ...this.display, animations: this.animate });
    if (this.links) this.links.visible = this.display.links !== false;
  }

  /** Full resync from game state (replay, undo, load). */
  sync(game) {
    if (!this.boardMesh) return;
    this.boardMesh.syncFrom(game);
    this.bridges.sync(game.bridges);
    this.links.sync(game.links());
  }

  /** Incremental update for a single claim. */
  applyMove(game, result) {
    const t = this.now();
    // without animations the claim lands already settled (claim time long past)
    this.boardMesh.setCell(result.cell, result.player, this.animate ? t : -100);
    if (this.animate) this.boardMesh.setLastClaim(this.board.cells[result.cell].centroid, t);
    for (const b of result.bridges) this.bridges.addBridge(b);
    for (const [a, b, o] of result.links ?? []) this.links.addLink(a, b, o);
    // a single claim can re-anchor a whole group, so repaint every border
    this.boardMesh.setConnections(game.connectionCounts());
    if (game.phase !== 'playing') this.boardMesh.applyPhase(game);
  }

  pick(clientX, clientY) {
    if (!this.board) return -1;
    const r = this.canvas.getBoundingClientRect();
    this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.pickPlane, this._hit);
    if (!hit) return -1;
    return this.board.cellAt(hit.x, -hit.z);
  }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id;
    this.boardMesh?.setHover(id);
    this.onHover?.(id);
  }

  resetView() { this.rig.reset(); }
  toggleTopDown() { this.rig.toggleTopDown(); }

  _buildFrame(board) {
    const group = new THREE.Group();
    const s = board.scale, h = this.boardMesh.height * 0.9, thick = 0.3 * s;
    for (const side of board.sides) {
      const arc = board.arcs[side.id];
      const col = new THREE.Color(this.theme.players[arc.owner] ?? '#888888').multiplyScalar(0.8);
      const dx = side.b[0] - side.a[0], dy = side.b[1] - side.a[1];
      const len = Math.hypot(dx, dy);
      const geo = new THREE.BoxGeometry(len + thick, h, thick);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.3 }));
      const mx = (side.a[0] + side.b[0]) / 2 + side.normal[0] * thick / 2;
      const my = (side.a[1] + side.b[1]) / 2 + side.normal[1] * thick / 2;
      mesh.position.set(mx, h / 2, -my);
      mesh.rotation.y = Math.atan2(dy, dx);
      group.add(mesh);
    }
    return group;
  }

  _fitCamera(board) {
    const b = board.bbox;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const R = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + board.scale;
    this.rig.fit(new THREE.Vector3(cx, 0, -cy), R);
    this.table.scale.set(R * 12, R * 12, 1);
    this.table.position.set(cx, -0.01, -cy);
  }

  _bindEvents() {
    let down = null;
    this.canvas.addEventListener('pointerdown', e => {
      // only a plain left press can become a claim; other buttons / modifiers pan
      down = e.button === 0 && !e.shiftKey && !e.ctrlKey ? [e.clientX, e.clientY] : null;
    });
    this.canvas.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
      down = null;
      if (moved < 6) this.onPick?.(this.pick(e.clientX, e.clientY));
    });
    this.canvas.addEventListener('pointermove', e => this.setHover(this.pick(e.clientX, e.clientY)));
    this.canvas.addEventListener('pointerleave', () => this.setHover(-1));
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.rig.update(dt);
    this.boardMesh?.update(this.clock.elapsedTime);
    this.gl.render(this.scene, this.camera);
  }
}