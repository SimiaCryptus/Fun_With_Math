const KEY_ACTIONS = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  Space: 'boost',
  KeyQ: 'lookBack',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  KeyR: 'restart',
  BracketLeft: 'effectDown',
  BracketRight: 'effectUp',
  KeyO: 'effectToggle',
  KeyM: 'mute',
};

const PAD_BUTTONS = {
  0: 'boost',
  1: 'lookBack',
  8: 'restart',
  9: 'pause',
};

/** Keyboard + gamepad abstraction with per-frame "just pressed" edges. */
export class Input {
  constructor(target = window) {
    this.keysDown = new Set();
    this.down = new Set();
    this.justPressed = new Set();
    this.padSteer = 0;
    this.padThrottle = 0;
    this.padBrake = 0;
    this._padPrev = new Set();

    target.addEventListener('keydown', (e) => {
      const action = KEY_ACTIONS[e.code];
      if (action) e.preventDefault();
      if (this.keysDown.has(e.code)) return;
      this.keysDown.add(e.code);
      if (action) this.justPressed.add(action);
      if (e.code === 'Space' || e.code === 'Enter') this.justPressed.add('confirm');
    });
    target.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    target.addEventListener('blur', () => {
      this.keysDown.clear();
      this.down.clear();
    });
  }

  update() {
    this.down.clear();
    for (const code of this.keysDown) {
      const action = KEY_ACTIONS[code];
      if (action) this.down.add(action);
    }
    this._pollGamepad();
  }

  _pollGamepad() {
    this.padSteer = 0;
    this.padThrottle = 0;
    this.padBrake = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.prototype.find.call(pads || [], (p) => p && p.connected);
    if (!pad) {
      this._padPrev.clear();
      return;
    }

    const ax = pad.axes[0] || 0;
    this.padSteer = Math.abs(ax) > 0.12 ? ax : 0;
    this.padThrottle = pad.buttons[7] ? pad.buttons[7].value : 0;
    this.padBrake = pad.buttons[6] ? pad.buttons[6].value : 0;
    if (this.padThrottle > 0.05) this.down.add('throttle');
    if (this.padBrake > 0.05) this.down.add('brake');

    const now = new Set();
    for (const [idx, action] of Object.entries(PAD_BUTTONS)) {
      const b = pad.buttons[Number(idx)];
      if (b && b.pressed) {
        now.add(action);
        this.down.add(action);
        if (!this._padPrev.has(action)) {
          this.justPressed.add(action);
          if (action === 'boost') this.justPressed.add('confirm');
        }
      }
    }
    this._padPrev = now;
  }

  isDown(action) {
    return this.down.has(action);
  }

  /** Returns true once per press. */
  consume(action) {
    if (!this.justPressed.has(action)) return false;
    this.justPressed.delete(action);
    return true;
  }

  /** Analog driving inputs. */
  controls() {
    const keySteer = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    const steer = keySteer !== 0 ? keySteer : this.padSteer;
    const throttle = Math.max(this.down.has('throttle') ? 1 : 0, this.padThrottle);
    const brake = Math.max(this.down.has('brake') ? 1 : 0, this.padBrake);
    return { steer, throttle, brake, boost: this.down.has('boost') };
  }

  endFrame() {
    this.justPressed.clear();
  }
}

export const NEUTRAL_CONTROLS = { steer: 0, throttle: 0, brake: 0, boost: false };
