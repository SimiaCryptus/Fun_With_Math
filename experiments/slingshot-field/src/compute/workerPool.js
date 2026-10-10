/** Fixed pool of module workers. Bumping the generation drops stale results. */
export class WorkerPool {
  constructor(url, n = Math.max(1, (navigator.hardwareConcurrency || 4) - 1)) {
    this.gen = 0; this.queue = []; this.busy = new Set(); this.resolve = null;
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(url, { type: 'module' });
      w.onmessage = (e) => this._done(w, e.data);
      w.onerror = (e) => console.error('worker error', e);
      return w;
    });
  }
  submit(jobs, onResult) {
    this.cancel();
    const gen = ++this.gen;
    return new Promise((res) => {
      this.resolve = res; this.onResult = onResult; this.remaining = jobs.length;
      this.queue = jobs.map((j) => ({ ...j, gen }));
      if (!jobs.length) { this.resolve = null; res(true); return; }
      for (const w of this.workers) if (!this.busy.has(w)) this._next(w);
    });
  }
  _next(w) {
    const j = this.queue.shift();
    if (!j) return;
    this.busy.add(w); w.postMessage(j);
  }
  _done(w, d) {
    this.busy.delete(w);
    if (d.gen === this.gen && this.resolve) {
      this.onResult(d);
      if (--this.remaining === 0) { const r = this.resolve; this.resolve = null; r(true); }
    }
    this._next(w);
  }
  cancel() {
    this.gen++; this.queue = [];
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(false); }
  }
}