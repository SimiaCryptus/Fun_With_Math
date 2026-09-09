import { msToMph } from '../core/MathX.js';
import { clamp01 } from '../core/MathX.js';

/**
 * Canvas2D HUD. The headline feature is the VELOCITY RIBBON: a 40-second scrolling
 * chart of your own past speed with gear markers, plus a ghost pip showing exactly
 * what speed the selected gear would snap you to. This is what makes the mechanic
 * learnable rather than mystical.
 */
export class HUD {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.stamp = null;        // {text, t}
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.c.width = innerWidth * dpr;
    this.c.height = innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = innerWidth; this.h = innerHeight;
  }

  showStamp(text) { this.stamp = { text, t: 1.1 }; }

  draw(race, dt) {
    const g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    const body = race.player.body;
    const snap = race.snapback;
    const mph = msToMph(body.speed);

    this._speedo(g, mph, snap);
    this._thermometer(g, snap.strain, snap.armed);
    this._ribbon(g, race);
    this._position(g, race);
    this._stamp(g, dt);
    if (race.phase === 'countdown') this._countdown(g, race.countdown);
  }

  _speedo(g, mph, snap) {
    const x = this.w - 210, y = this.h - 120;
    g.save();
    g.font = '700 84px Impact, sans-serif';
    g.textAlign = 'right';
    g.fillStyle = snap.armed ? '#c8ff2a' : '#ffe9b0';
    g.strokeStyle = '#000'; g.lineWidth = 7;
    g.strokeText(mph.toFixed(0), x + 150, y + 60);
    g.fillText(mph.toFixed(0), x + 150, y + 60);
    g.font = '700 22px Impact, sans-serif';
    g.strokeText('MPH', x + 150, y + 88); g.fillText('MPH', x + 150, y + 88);
    if (snap.armed) {
      g.font = '700 26px Impact, sans-serif';
      g.fillStyle = (performance.now() % 400 < 200) ? '#ff3b1f' : '#ffd21f';
      g.strokeText('88! SKIP IT!', x + 150, y + 118);
      g.fillText('88! SKIP IT!', x + 150, y + 118);
    }
    g.restore();
  }

  _thermometer(g, strain, armed) {
    const x = this.w - 62, y = this.h - 340, w = 26, h = 200;
    g.save();
    g.fillStyle = '#1b1206'; g.strokeStyle = '#000'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill(); g.stroke();
    const fh = h * clamp01(strain);
    const grad = g.createLinearGradient(0, y + h, 0, y);
    grad.addColorStop(0, '#7ab317'); grad.addColorStop(0.6, '#ffd21f'); grad.addColorStop(1, '#ff3b1f');
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(x + 3, y + h - fh + 3, w - 6, Math.max(0, fh - 6), 9); g.fill();
    if (armed) { g.strokeStyle = '#c8ff2a'; g.lineWidth = 3; g.stroke(); }
    g.restore();
  }

  _ribbon(g, race) {
    const hist = race.player.history;
    const gear = race.snapback.gear;
    const W = Math.min(620, this.w - 300), H = 96;
    const x = 24, y = this.h - H - 24;
    const span = 40;   // seconds shown

    g.save();
    g.fillStyle = 'rgba(18,12,5,0.72)';
    g.strokeStyle = '#000'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(x, y, W, H, 10); g.fill(); g.stroke();

    // speed trace: right edge = now, left edge = 40 s ago
    const maxMph = 110;
    g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const age = (i / 200) * span;
      const mph = msToMph(hist.speedAt(age));
      const px = x + W - (age / span) * W;
      const py = y + H - 8 - (clamp01(mph / maxMph)) * (H - 18);
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.strokeStyle = '#c8ff2a'; g.lineWidth = 2.5; g.stroke();

    // gear markers
    for (const gm of [8, 20, 40]) {
      const px = x + W - (gm / span) * W;
      g.strokeStyle = gm === gear.offset ? '#ff3b1f' : 'rgba(255,233,176,0.35)';
      g.lineWidth = gm === gear.offset ? 3 : 1;
      g.beginPath(); g.moveTo(px, y + 4); g.lineTo(px, y + H - 4); g.stroke();
      g.fillStyle = g.strokeStyle;
      g.font = '700 12px Impact, sans-serif';
      g.fillText(`-${gm}s`, px + 3, y + 14);
    }

    // GHOST PIP: the speed you would snap to right now
    const s = hist.sample(gear.offset);
    const px = x + W - (Math.min(s.age, span) / span) * W;
    const py = y + H - 8 - clamp01(msToMph(s.speed) / maxMph) * (H - 18);
    g.fillStyle = s.clamped ? '#ff3b1f' : '#ffd21f';
    g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();

    g.fillStyle = '#ffe9b0';
    g.font = '700 16px Impact, sans-serif';
    g.fillText(`${gear.name.toUpperCase()}  →  ${msToMph(s.speed).toFixed(0)} MPH${s.clamped ? '  (TOO YOUNG!!)' : ''}`,
      x + 8, y - 8);

    // cooldown bar
    const cd = race.snapback.cooldown, cdMax = gear.cooldown;
    if (cd > 0) {
      g.fillStyle = 'rgba(255,59,31,0.85)';
      g.fillRect(x, y + H - 5, W * (cd / cdMax), 5);
    }
    g.restore();
  }

  _position(g, race) {
    const pos = race.standings.indexOf(race.player) + 1;
    g.save();
    g.font = '700 56px Impact, sans-serif';
    g.strokeStyle = '#000'; g.lineWidth = 6; g.fillStyle = '#ffe9b0';
    const txt = `${pos}/${race.standings.length}`;
    g.strokeText(txt, 26, 68); g.fillText(txt, 26, 68);
    g.font = '700 24px Impact, sans-serif';
    const lap = `LAP ${Math.min(race.laps, race.player.lap + 1)}/${race.laps}`;
    g.strokeText(lap, 26, 98); g.fillText(lap, 26, 98);
    g.restore();
  }

  _stamp(g, dt) {
    if (!this.stamp) return;
    this.stamp.t -= dt;
    if (this.stamp.t <= 0) { this.stamp = null; return; }
    const k = this.stamp.t / 1.1;
    g.save();
    g.translate(this.w / 2, this.h * 0.34);
    g.rotate(-0.12 + Math.sin(k * 30) * 0.03);
    g.scale(1 + (1 - k) * 0.4, 1 + (1 - k) * 0.4);
    g.globalAlpha = Math.min(1, k * 2);
    g.font = '700 92px Impact, sans-serif';
    g.textAlign = 'center';
    g.strokeStyle = '#000'; g.lineWidth = 10; g.fillStyle = '#ffd21f';
    g.strokeText(this.stamp.text, 0, 0); g.fillText(this.stamp.text, 0, 0);
    g.restore();
  }

  _countdown(g, t) {
    g.save();
    g.font = '700 160px Impact, sans-serif'; g.textAlign = 'center';
    g.strokeStyle = '#000'; g.lineWidth = 12; g.fillStyle = '#7ab317';
    const n = Math.ceil(t);
    const txt = n > 0 ? String(n) : 'SLOP!';
    g.strokeText(txt, this.w / 2, this.h / 2); g.fillText(txt, this.w / 2, this.h / 2);
    g.restore();
  }
}