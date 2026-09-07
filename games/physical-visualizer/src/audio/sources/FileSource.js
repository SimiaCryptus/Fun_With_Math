import { ElementSource } from './ElementSource.js';

/** Local files via object URLs (safest path on iOS Safari). Maintains a simple queue. */
export class FileSource extends ElementSource {
  constructor(ctx, events) {
    const el = new Audio();
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    super(ctx, el, events);
    this.queue = []; this.index = -1; this._url = null;
    el.addEventListener('ended', () => this.next(true));
  }

  addFiles(files) {
    const start = this.queue.length;
    for (const f of files) this.queue.push({ file: f, title: f.name.replace(/\.[^.]+$/, '') });
    if (this.index < 0 || this.el.ended) this.load(this.index < 0 ? 0 : start);
    this.E?.emit('playlist', this.queue);
  }

  load(i) {
    if (!this.queue.length) return;
    i = (i + this.queue.length) % this.queue.length;
    this.index = i;
    if (this._url) URL.revokeObjectURL(this._url);
    this._url = URL.createObjectURL(this.queue[i].file);
    this.el.src = this._url;
    this.title = this.queue[i].title;
    this.play();
    this.E?.emit('track', { title: this.title, index: i, count: this.queue.length });
  }

  next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.queue.length === 1) { this.el.currentTime = 0; this.play(); return; }
    this.load(this.index + 1);
  }

  prev() { this.load(this.index - 1); }
}