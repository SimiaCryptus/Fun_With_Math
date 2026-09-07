/** Wraps an <audio> element as a graph source with transport controls. */
export class ElementSource {
  constructor(ctx, el, events) {
    this.el = el; this.E = events;
    this.node = ctx.createMediaElementSource(el);
    this.monitor = true;
    this.title = el.title || 'Audio';
    el.addEventListener('play', () => events?.emit('track:play'));
    el.addEventListener('pause', () => events?.emit('track:pause'));
  }

  connect(dst) { this.node.connect(dst); }
  disconnect() { this.node.disconnect(); }

  get playing() { return !this.el.paused; }
  get duration() { return this.el.duration || 0; }
  get currentTime() { return this.el.currentTime || 0; }

  play() { return this.el.play().catch((e) => this.E?.emit('toast', `Playback blocked: ${e.message}`)); }
  pause() { this.el.pause(); }
  stop() { this.el.pause(); this.el.currentTime = 0; }
  seek(t) { this.el.currentTime = t; }
}