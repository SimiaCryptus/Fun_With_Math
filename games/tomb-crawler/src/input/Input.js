const KEY_DIRS = { KeyD: 0, KeyX: 1, KeyC: 1, KeyZ: 2, KeyA: 3, KeyQ: 4, KeyW: 4, KeyE: 5 };
const SWIPE_MIN = 22;

// Keyboard + touch/mouse swipes → game commands.
export class Input {
  constructor(game, el) {
    this.game = game;
    this.lastH = 0; // last horizontal direction (0 = E, 3 = W) for arrow-key combos
    this.active = false;
    this.pid = -1;
    this.sx = 0; this.sy = 0;

    window.addEventListener('keydown', (e) => this.onKey(e));

    el.addEventListener('pointerdown', (e) => {
      this.active = true;
      this.pid = e.pointerId;
      this.sx = e.clientX; this.sy = e.clientY;
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.active || e.pointerId !== this.pid) return;
      const dx = e.clientX - this.sx, dy = e.clientY - this.sy;
      if (Math.hypot(dx, dy) < SWIPE_MIN) return;
      // Camera looks toward -z with no yaw: screen right = +x, screen down = +z.
      const a = Math.atan2(dy, dx);
      const d = ((Math.round(a / (Math.PI / 3)) % 6) + 6) % 6;
      this.game.queueDir(d);
      this.sx = e.clientX; this.sy = e.clientY;
    });
    const end = (e) => { if (e.pointerId === this.pid) this.active = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  }

  onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    const g = this.game;
    const c = e.code;
    if (c === 'Space' || c === 'Tab' || c.startsWith('Arrow')) e.preventDefault();
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae.blur) ae.blur();

    if (c === 'KeyP' || c === 'Escape') { if (!e.repeat) g.togglePause(); return; }
    if (g.state !== 'playing') {
      if (c === 'Enter' && !e.repeat) {
        if (g.state === 'title') g.action('play');
        else if (g.state === 'gameover') g.action('restart');
      }
      return;
    }

    if (c in KEY_DIRS) { g.queueDir(KEY_DIRS[c]); return; }
    switch (c) {
      case 'ArrowRight': this.lastH = 0; g.queueDir(0); return;
      case 'ArrowLeft': this.lastH = 3; g.queueDir(3); return;
      case 'ArrowUp': g.queueDir(this.lastH === 0 ? 5 : 4); return;
      case 'ArrowDown': g.queueDir(this.lastH === 0 ? 1 : 2); return;
      case 'Space': if (!e.repeat) g.deploy(); return;
      case 'Tab': g.cycleSlot(); return;
      case 'Digit1': case 'Numpad1': g.selectSlot(0); return;
      case 'Digit2': case 'Numpad2': g.selectSlot(1); return;
      case 'Digit3': case 'Numpad3': g.selectSlot(2); return;
    }
  }
}