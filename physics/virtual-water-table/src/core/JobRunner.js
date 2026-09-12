import { log } from './Log.js';
/**
 * Dispatches design evaluations to a module worker; falls back to a cooperative
 * main-thread pump (setTimeout slices) when workers are unavailable (e.g. file://).
 */
export class JobRunner {
  constructor(workerUrl) {
    this.url = workerUrl; this.worker = null; this.jobs = new Map(); this.id = 0;
    this.useWorker = typeof Worker !== 'undefined' && location.protocol !== 'file:';
  }
  _ensure() {
    if (!this.useWorker || this.worker) return;
    try {
      this.worker = new Worker(this.url, { type: 'module' });
      this.worker.onmessage = (e) => this._onMsg(e.data);
      this.worker.onerror = (e) => { log.warn('worker failed; falling back to inline', e.message); this.useWorker = false; const jobs = [...this.jobs.values()]; this.worker = null; for (const j of jobs) this._runInline(j); };
    } catch (err) { log.warn('worker unavailable', String(err)); this.useWorker = false; }
  }
  run(payload, onProgress) {
    return new Promise((resolve, reject) => {
      const id = ++this.id; const job = { id, payload, onProgress, resolve, reject, cancelled: false };
      this.jobs.set(id, job); this._ensure();
      if (this.useWorker && this.worker) this.worker.postMessage({ id, payload }); else this._runInline(job);
    });
  }
  _onMsg(m) {
    const job = this.jobs.get(m.id); if (!job) return;
    if (m.type === 'progress') job.onProgress?.(m.progress);
    else if (m.type === 'result') { this.jobs.delete(m.id); job.resolve(m.result); }
    else { this.jobs.delete(m.id); job.reject(new Error(m.error)); }
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
    this.jobs.clear();
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}