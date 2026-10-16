// Message facade. A WASM core can replace analyze() behind the same API.
import { analyze } from './analyze.js';

self.onmessage = (e) => {
  const { id, state } = e.data;
  self.postMessage({ id, result: analyze(state) });
};