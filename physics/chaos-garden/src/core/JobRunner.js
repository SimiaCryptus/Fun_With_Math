import { log } from './Log.js';
/**
 * Dispatches design evaluations to a pool of module workers so sweep ladders and evolve children
 * run concurrently; falls back to a cooperative main-thread pump (setTimeout slices) when workers
 * are unavailable (e.g. file://). Protocol matches workers/evolve.worker.js.
 */
export class JobRunner {
  constructor(workerUrl, { poolSize } = {}) {
    this.url = workerUrl; this.jobs = new Map(); this.queue = []; this.workers = []; this.id = 0;
    this.useWorker = typeof Worker !== 'undefined' && location.protocol !== 'file:';
    this.poolSize = poolSize ?? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)); // leave one core for the live sim
  }
  /** Evaluations that can run at once (1 on the inline fallback). */
  get concurrency() { return this.useWorker ? this.poolSize : 1; }
  run(payload, onProgress) {
    return new Promise((resolve, reject) => {
      const id = ++this.id, job = { id, payload, onProgress, resolve, reject, cancelled: false, slot: null };
      this.jobs.set(id, job);
      if (this.useWorker) { this.queue.push(job); this._dispatch(); } else this._runInline(job);
    });
  }
  _spawn() {
    try {
      const slot = { w: new Worker(this.url, { type: 'module' }), job: null };
      slot.w.onmessage = (e) => this._onMsg(slot, e.data);
      slot.w.onerror = (e) => this._workersFailed(e?.message || 'worker error');
      this.workers.push(slot); return slot;
    } catch (err) { this._workersFailed(String(err)); return null; }
  }
  _dispatch() {
    while (this.queue.length && this.useWorker) {
      let slot = this.workers.find((s) => !s.job);
      if (!slot && this.workers.length < this.poolSize) slot = this._spawn();
      if (!slot) break; // pool saturated (or just failed over)
      const job = this.queue.shift(); slot.job = job; job.slot = slot;
      slot.w.postMessage({ id: job.id, payload: job.payload });
    }
    if (!this.useWorker) { const q = this.queue.splice(0); for (const j of q) this._runInline(j); }
  }
  _workersFailed(reason) {
    if (!this.useWorker) return;
    log.warn('worker failed; falling back to inline evaluation', reason);
    this.useWorker = false;
    const inflight = this.workers.map((s) => s.job).filter(Boolean);
    for (const s of this.workers) s.w.terminate(); this.workers = [];
    this.queue.unshift(...inflight); this._dispatch();
  }
  _onMsg(slot, m) {
    const job = this.jobs.get(m.id); if (!job) return;
    if (m.type === 'progress') { job.onProgress?.(m.progress); return; }
    this.jobs.delete(m.id); slot.job = null;
    if (m.type === 'result') job.resolve(m.result); else job.reject(new Error(m.error));
    this._dispatch();
  }
  async _runInline(job) {
    const { evaluateDesign } = await import('../sim/Evaluate.js');
    let gen; try { gen = evaluateDesign(job.payload); } catch (err) { this.jobs.delete(job.id); return job.reject(err); }
    const pump = () => {
      if (job.cancelled) return;
      const t = performance.now(); let r;
      try { do { r = gen.next(); if (!r.done && r.value?.progress != null) job.onProgress?.(r.value.progress); } while (!r.done && performance.now() - t < 12); }
      catch (err) { this.jobs.delete(job.id); return job.reject(err); }
      if (r.done) { this.jobs.delete(job.id); job.resolve(r.value); } else setTimeout(pump, 0);
    };
    pump();
  }
  cancelAll() {
    for (const j of this.jobs.values()) { j.cancelled = true; j.reject(new Error('cancelled')); }
    this.jobs.clear(); this.queue.length = 0;
    for (const s of this.workers) s.w.terminate(); this.workers = [];
  }
}