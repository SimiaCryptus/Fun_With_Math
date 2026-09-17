import { formatTime } from '../core/Clock.js';

export class HUD {
  constructor(root = document.getElementById('hud')) {
    this.root = root;
    this.el = {
      speed: document.getElementById('hud-speed'),
      beta: document.getElementById('hud-beta'),
      gamma: document.getElementById('hud-gamma'),
      boostFill: document.getElementById('hud-boost-fill'),
      boost: document.getElementById('hud-boost'),
      proper: document.getElementById('hud-proper'),
      coord: document.getElementById('hud-coord'),
      lap: document.getElementById('hud-lap'),
      best: document.getElementById('hud-best'),
      effect: document.getElementById('hud-effect'),
      message: document.getElementById('hud-message'),
      warning: document.getElementById('hud-warning'),
    };
    this._msgUntil = 0;
  }

  setVisible(v) {
    this.root.classList.toggle('hidden', !v);
  }

  setMessage(text, holdSeconds = 0.35) {
    if (!text) {
      this.el.message.classList.remove('show');
      this._msgUntil = 0;
      return;
    }
    this.el.message.textContent = text;
    this.el.message.classList.add('show');
    this._msgUntil = performance.now() + holdSeconds * 1000;
  }

  flash(text, holdSeconds = 0.6) {
    this.setMessage(text, holdSeconds);
  }

  update(s) {
    if (this._msgUntil && performance.now() > this._msgUntil) {
      this.el.message.classList.remove('show');
      this._msgUntil = 0;
    }

    this.el.speed.textContent = s.mph.toFixed(1);
    this.el.beta.textContent = s.beta.toFixed(3);
    this.el.gamma.textContent = s.gamma.toFixed(3);
    this.el.boostFill.style.width = `${Math.round(s.boost * 100)}%`;
    this.el.boost.textContent = `${Math.round(s.boost * 100)}%`;
    this.el.proper.textContent = formatTime(s.proper);
    this.el.coord.textContent = formatTime(s.coord);
    this.el.lap.textContent = `${Math.min(s.lap, s.laps)}/${s.laps}`;
    this.el.best.textContent = formatTime(s.best);
    this.el.effect.textContent = `${Math.round(s.effect * 100)}%`;
    this.el.warning.classList.toggle('hidden', !(s.beta > 0.9));
  }
}