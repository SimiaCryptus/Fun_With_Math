/** Module worker: evaluates one design at one depth (used by Sweep and Evolve). Protocol matches core/JobRunner.js. */
import { evaluateDesign } from '../src/sim/Evaluate.js';

self.onmessage = (e) => {
  const { id, payload } = e.data;
  try {
    const gen = evaluateDesign(payload); let r, last = -1;
    do {
      r = gen.next();
      if (!r.done && r.value?.progress != null && r.value.progress - last >= 0.01) { last = r.value.progress; self.postMessage({ id, type: 'progress', progress: last }); }
    } while (!r.done);
    self.postMessage({ id, type: 'result', result: r.value });
  } catch (err) {
    self.postMessage({ id, type: 'error', error: String(err?.stack || err) });
  }
};