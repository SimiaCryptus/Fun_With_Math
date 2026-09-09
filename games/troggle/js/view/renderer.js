/**
 * renderer.js — scene, camera, render loop, resize (§5.1). The view is a pure
 * consumer: it is told what to draw and never mutates game state.
 */

import * as THREE from 'three';
import { CubeField } from './cubes.js';
import { Effects } from './effects.js';
import { PathLine } from './pathline.js';
import { CameraControls } from './controls.js';

export class View {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

    const hemi = new THREE.HemisphereLight(0xdfefff, 0x1b2430, 1.15);
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(4, 7, 6);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.35);
    fill.position.set(-5, -3, -4);
    this.scene.add(hemi, key, fill);

    this.block = new THREE.Group();
    this.scene.add(this.block);

    this.pathline = new PathLine({ reducedMotion });
    this.block.add(this.pathline.group);

    this.controls = new CameraControls(this.camera, canvas, { reducedMotion });
    this.cubes = null;
    this.effects = null;

    this._v3 = new THREE.Vector3();
    this._points = [];
    this._path = [];
     this._linePeel = 0;
    this._clock = new THREE.Clock();
    this._running = false;
    this._loop = () => this._frame();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  // ---------------------------------------------------------------- board

  setBoard(grid) {
    if (this.cubes) {
      this.block.remove(this.cubes.group);
      this.cubes.dispose();
    }
    this.cubes = new CubeField(grid);
    this.effects = new Effects(this.cubes, { reducedMotion: this.reducedMotion });
    this.block.add(this.cubes.group);
    this.setPath([], null);
    this.controls.snap('iso', 0);
    this.frame();
  }

  frame() {
    if (!this.cubes) return;
    const g = this.cubes.grid;
    const radius = g.size * this.cubes.spacing * 0.78;
    this.controls.frame(radius);
  }

  // ------------------------------------------------------------ selection

  /**
   * @param {number[]} path
   * @param {Set<number>|null} legal
   */
  setPath(path, legal) {
    if (!this.cubes) return;
    this._path = path ?? [];
    this.effects.setFocus(this._path, legal);
    this._rebuildLine();
  }

  _rebuildLine() {
    const pts = this._points;
    pts.length = 0;
    for (const i of this._path) pts.push(this.cubes.centerOf(i, new THREE.Vector3()));
    this.pathline.setPoints(pts);
     this._linePeel = this.effects ? this.effects.peel : 0;
  }

  flash(index) {
    this.cubes?.flash(index, 1);
  }

  celebrate(path) {
    if (!path) return;
    for (const i of path) this.cubes?.flash(i, 0.7);
  }

  setCursor(index) {
    if (this.effects) this.effects.cursor = index ?? -1;
  }

  setHint(index) {
    if (this.effects) this.effects.hint = index ?? -1;
  }

  // -------------------------------------------------------------- picking

   /**
     * Cube whose *letter* is under the pointer. The cube shells are not drawn at
     * all, so only glyph pixels (plus a small snap radius) are clickable — no
     * more accidental hits on the empty space between letters. When `prefer` is
     * given (legal next cubes, path head/tail) those glyphs win, so you can
     * reach an interior letter you can see behind a front one.
    * @param {Set<number>|null} [prefer]
    * @returns {number|null}
    */
   hitTest(clientX, clientY, prefer = null) {
    if (!this.cubes) return null;
    const r = this.canvas.getBoundingClientRect();
     const idx = this.cubes.pickLetter(
       clientX - r.left,
       clientY - r.top,
       r.width,
       r.height,
       this.camera,
       prefer,
    );
     return idx < 0 ? null : idx;
  }

  // ----------------------------------------------------------------- loop

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = Math.max(0.1, w / h);
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    this.renderer.setAnimationLoop(this._loop);
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  _frame() {
    const dt = Math.min(0.05, this._clock.getDelta());
    this.controls.update(dt);
     if (this.cubes) this.cubes.setViewDistance(this.camera.position.length());
    if (this.effects) this.effects.update(dt);
     // The tube follows the cubes while (and only while) the peel is moving.
     if (this._path.length > 1 && this.effects && Math.abs(this.effects.peel - this._linePeel) > 1e-4) {
       this._rebuildLine();
     }
    this.pathline.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.pathline.dispose();
    this.cubes?.dispose();
    this.renderer.dispose();
  }
}

export default View;