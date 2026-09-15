import * as THREE from 'three';
import { CZ } from '../engine/geometry.js';
import { tween, Easing } from '../core/tween.js';
import { PIECE_Y } from './PieceView.js';

export class AnimationSystem {
  constructor(scene, pieces, bus, getSpeed, posOf) {
    this.scene = scene;
    this.pieces = pieces;
    this.bus = bus;
    this.getSpeed = getSpeed;
    this.posOf = posOf;
    this.queue = Promise.resolve();
    this.active = 0;
  }

  /** Queue a move animation; returns a promise resolved when this move finishes. */
  play(ev) {
    this.queue = this.queue.then(() => this.run(ev)).catch(console.error);
    return this.queue;
  }

  /** Run `fn` once all queued animations are done. */
  then(fn) { this.queue = this.queue.then(fn).catch(console.error); return this.queue; }

  async run({ move, prev, state, piece }) {
    this.active++;
    this.bus.emit('animating', true);
    const speed = Math.max(0.1, this.getSpeed());
    const display = new Uint8Array(prev.board);
    display[move.from] = 0;
    this.pieces.setBoard(display, new Set());

    const mover = new THREE.Mesh(this.pieces.geometryFor(piece), this.pieces.materialFor(piece));
    mover.castShadow = true;
    this.scene.add(mover);

    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const isCapture = move.captured.length > 0;
    for (let i = 1; i < move.path.length; i++) {
      this.posOf(move.path[i - 1], a); a.y += PIECE_Y;
      this.posOf(move.path[i], b); b.y += PIECE_Y;
      const arc = (isCapture ? 1.2 : 0.45) + Math.abs(CZ[move.path[i]] - CZ[move.path[i - 1]]) * 0.5;
      await tween({
        duration: (isCapture ? 420 : 320) / speed, ease: Easing.inOutQuad,
        onUpdate: (k) => { mover.position.lerpVectors(a, b, k); mover.position.y += Math.sin(Math.PI * k) * arc; },
      });
      if (isCapture) {
        display[move.captured[i - 1]] = 0;
        this.pieces.setBoard(display);
        this.bus.emit('pieceCaptured', { idx: move.captured[i - 1] });
      }
    }
    if (move.becomesKing) {
      await tween({ duration: 320 / speed, onUpdate: (k) => mover.scale.setScalar(1 + Math.sin(Math.PI * k) * 0.45) });
      this.bus.emit('pieceKinged', { idx: move.to });
    }
    this.scene.remove(mover);
    this.pieces.setBoard(state.board, new Set());
    this.active--;
    if (!this.active) this.bus.emit('animating', false);
  }
}