/**
 * Interim DOM transport. Emits/consumes the same events the skinned MainWindow will use:
 * ui:open, ui:mic, preset:change, track. Winamp keys: z x c v b.
 */
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Controls {
  constructor({ root, events, audio, presets, hud }) {
    this.root = root; this.E = events; this.audio = audio; this.presets = presets; this.hud = hud;
    const $ = (s) => root.querySelector(s);
    const on = (sel, fn) => $(sel).addEventListener('click', fn);
    const fileInput = document.getElementById('file');
    this.$time = $('#time'); this.$play = $('#btn-play'); this.$seek = $('#seek');
    this.$marquee = $('#marquee'); this.$preset = $('#preset-name');

    on('#btn-open', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) events.emit('ui:open', [...fileInput.files]);
      fileInput.value = '';
    });
    on('#btn-mic', () => events.emit('ui:mic'));
    on('#btn-play', () => this.togglePlay());
    on('#btn-prev-track', () => this.src()?.prev?.());
    on('#btn-next-track', () => this.src()?.next?.());
    on('#btn-prev-preset', () => presets.prev());
    on('#btn-next-preset', () => presets.next());
    on('#btn-random', () => presets.random());
    on('#btn-fs', () => Controls.toggleFullscreen());
    on('#btn-hud', () => hud.toggle());

    this._seeking = false;
    this.$seek.addEventListener('pointerdown', () => { this._seeking = true; });
    this.$seek.addEventListener('change', () => {
      const s = this.src();
      if (s?.duration) s.seek((this.$seek.value / 1000) * s.duration);
      this._seeking = false;
    });

    events.on('preset:change', (def) => { this.$preset.textContent = def.name; });
    events.on('track', (t) => { this.$marquee.textContent = `${t.title}${t.count ? `  [${t.index + 1}/${t.count}]` : ''}`; });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  src() { return this.audio.source; }

  togglePlay() {
    const s = this.src();
    if (!s?.el) { document.getElementById('file').click(); return; }
    s.playing ? s.pause() : s.play();
  }

  onKey(e) {
    if (e.target.matches('input,button,textarea,select')) return;
    const s = this.src();
    switch (e.key) {
      case ' ': e.preventDefault(); this.togglePlay(); break;
      case 'z': s?.prev?.(); break;
      case 'x': s?.play?.(); break;
      case 'c': s?.pause?.(); break;
      case 'v': s?.stop?.(); break;
      case 'b': s?.next?.(); break;
      case 'ArrowRight': this.presets.next(); break;
      case 'ArrowLeft': this.presets.prev(); break;
      case 'r': this.presets.random(); break;
      case 'f': Controls.toggleFullscreen(); break;
      default: break;
    }
  }

  update() {
    const el = this.src()?.el;
    if (!el) return;
    const t = el.currentTime || 0;
    this.$time.textContent = fmt(t);
    if (el.duration && !this._seeking) this.$seek.value = ((t / el.duration) * 1000) | 0;
    this.$play.textContent = el.paused ? '▶' : '⏸';
  }

  static async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        screen.orientation?.lock?.('landscape').catch(() => {});   // party mode, best effort
      }
    } catch { /* not supported (iOS Safari) */ }
  }
}