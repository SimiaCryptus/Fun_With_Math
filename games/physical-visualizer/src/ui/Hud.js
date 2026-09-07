/** Debug HUD: every signal as a live sparkline. Toggled with ~ (stays forever, per spec). */
export class Hud {
  constructor(canvas, signals) {
    this.c = canvas; this.S = signals;
    this.ctx = canvas.getContext('2d');
    this.visible = false;
    window.addEventListener('keydown', (e) => { if (e.key === '`' || e.key === '~') this.toggle(); });
  }

  toggle(force) {
    this.visible = force ?? !this.visible;
    this.c.hidden = !this.visible;
  }

  draw() {
    if (!this.visible) return;
    const names = this.S.names();
    const rowH = 16, w = 260, labelW = 84, h = names.length * rowH + 4;
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    names.forEach((name, i) => {
      const s = this.S.history(name);
      const y0 = 2 + i * rowH, mid = y0 + rowH / 2;
      const neg = s.min < 0;
      ctx.fillStyle = '#9c9';
      ctx.fillText(`${name} ${s.value.toFixed(2)}`, 2, mid);
      ctx.strokeStyle = s.impulse ? '#f66' : '#6cf';
      ctx.beginPath();
      const n = s.hist.length, span = w - labelW - 4;
      for (let k = 0; k < n; k++) {
        const v = s.hist[(s.head + k) % n];
        const range = s.max - s.min || 1;
        const yy = y0 + rowH - 1 - ((v - s.min) / range) * (rowH - 2);
        const xx = labelW + (k / (n - 1)) * span;
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
      if (neg) { ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(labelW, mid); ctx.lineTo(w - 4, mid); ctx.stroke(); }
    });
  }
}