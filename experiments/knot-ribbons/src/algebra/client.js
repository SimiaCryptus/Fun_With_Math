import { analyze } from './analyze.js';

export function createAlgebra() {
  let worker = null;
  const pending = new Map();
  let seq = 0;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (p) { pending.delete(e.data.id); p.resolve(e.data.result); }
    };
    worker.onerror = () => {
      worker = null;
      for (const [id, p] of pending) { pending.delete(id); p.resolve(analyze(p.state)); }
    };
  } catch {
    worker = null;
  }
  return {
    analyze(state) {
      if (!worker) return Promise.resolve(analyze(state));
      const id = ++seq;
      return new Promise((resolve) => {
        pending.set(id, { resolve, state });
        worker.postMessage({ id, state });
      });
    },
  };
}