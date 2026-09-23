const $ = (id) => document.getElementById(id);

export class Screens {
  constructor(game) {
    this.game = game;
    this.els = {
      title: $('screen-title'),
      pause: $('screen-pause'),
      gameover: $('screen-gameover'),
      settings: $('screen-settings'),
    };
    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => { b.blur(); game.action(b.dataset.action); });
    });
    this.vol = $('set-volume');
    this.cam = $('set-camera');
    this.touch = $('set-touch');
    this.vol.addEventListener('input', () => game.applySettings({ volume: Number(this.vol.value) }));
    this.cam.addEventListener('change', () => game.applySettings({ camera: this.cam.value }));
    this.touch.addEventListener('change', () => game.applySettings({ touch: this.touch.value }));
  }

  show(name) {
    for (const [k, el] of Object.entries(this.els)) el.classList.toggle('hidden', k !== name);
  }

  fillTitle(store) {
    $('title-best').textContent = String(store.best || 0);
    $('title-dist').textContent = String(store.bestDist || 0);
  }

  fillGameOver(d) {
    $('go-score').textContent = String(d.score);
    $('go-best').textContent = String(d.best);
    $('go-dist').textContent = String(d.dist);
    $('go-bonus').textContent = String(d.bonus);
    $('go-coins').textContent = String(d.coins);
    $('go-wasted').textContent = String(d.wasted);
    $('go-kills').textContent = String(d.kills);
    $('go-newbest').classList.toggle('hidden', !d.newBest);
  }

  fillSettings(s) {
    this.vol.value = String(s.volume);
    this.cam.value = s.camera === 'ortho' ? 'ortho' : 'perspective';
    this.touch.value = s.touch === 'left' ? 'left' : 'right';
  }
}