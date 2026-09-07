const CLICK_MOVE_PX = 6;
const LONG_PRESS_MS = 450;

/**
 * Maps device events to intents: { type: 'strike'|'mark'|'probe', x, y }.
 * Orbit drags are left to OrbitControls; a press that moves is never a click.
 */
export class InputRouter {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.h = handlers;
    this.touchMode = 'strike';
    this.down = null;
    this.longPress = null;
    this.lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.h.onXray?.(false));
  }

  setTouchMode(mode) {
    this.touchMode = mode;
  }

  cancel() {
    this.down = null;
    clearTimeout(this.longPress);
    this.longPress = null;
  }

  onDown(e) {
    this.down = { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType, moved: false, consumed: false };
    if (e.pointerType === 'touch') {
      clearTimeout(this.longPress);
      this.longPress = setTimeout(() => {
        if (this.down && !this.down.moved) {
          this.down.consumed = true;
          this.h.onIntent({ type: 'mark', x: this.down.x, y: this.down.y, source: 'long-press' });
        }
      }, LONG_PRESS_MS);
    }
  }

  onMove(e) {
    this.lastPointer.x = e.clientX;
    this.lastPointer.y = e.clientY;
    if (this.down) {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_MOVE_PX) {
        this.down.moved = true;
        clearTimeout(this.longPress);
      }
      return;
    }
    this.h.onHover?.(e.clientX, e.clientY);
  }

  onUp(e) {
    const d = this.down;
    this.cancel();
    if (!d || d.moved || d.consumed) return;
    let type = null;
    if (d.type === 'touch') type = this.touchMode === 'mark' ? 'mark' : 'strike';
    else if (d.button === 0) type = 'strike';
    else if (d.button === 2) type = 'mark';
    else if (d.button === 1) type = 'probe';
    if (type) this.h.onIntent({ type, x: e.clientX, y: e.clientY, source: 'pointer' });
  }

  onKeyDown(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
      e.preventDefault();
      this.h.onXray?.(true);
      return;
    }
    if (e.repeat) return;
    const { x, y } = this.lastPointer;
    if (e.code === 'KeyE') this.h.onIntent({ type: 'strike', x, y, source: 'key' });
    else if (e.code === 'KeyQ') this.h.onIntent({ type: 'mark', x, y, source: 'key' });
    else if (e.code === 'KeyF') this.h.onIntent({ type: 'probe', x, y, source: 'key' });
    else this.h.onKey?.(e);
  }

  onKeyUp(e) {
    if (e.code === 'AltLeft' || e.code === 'AltRight') this.h.onXray?.(false);
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}