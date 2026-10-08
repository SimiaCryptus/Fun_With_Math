#!/usr/bin/env node
// Batch job: tabulate the normalized pair-field configuration space (see table.js).
//   node tools/tabulate.js [--out assets/field-table.bin] [--workers N] [--quick]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { makeMeta, tabulateRange, encodeTable, QUICK_AXES } from '../src/core/field/table.js';

if (!isMainThread) {
  parentPort.on('message', ({ meta, start, end }) => {
    const r = tabulateRange(meta, start, end);
    parentPort.postMessage({ start, scales: r.scales, data: r.data }, [r.scales.buffer, r.data.buffer]);
  });
} else {
  main();
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const meta = makeMeta(args.includes('--quick') ? { axes: QUICK_AXES } : {});
  const out = opt('out', fileURLToPath(new URL('../assets/field-table.bin', import.meta.url)));
  const CHUNK = 16;
  const nw = Math.max(1, Math.min(Number(opt('workers', os.cpus().length)) | 0, Math.ceil(meta.configs / CHUNK)));
  const M = meta.modes, perData = meta.modes * meta.n;
  const scales = new Float32Array(meta.configs * M);
  const data = new Int16Array(meta.configs * perData);
  console.log(`tabulating ${meta.configs} configs × ${M} modes × ${meta.n} panels on ${nw} workers`);
  const t0 = Date.now();
  let next = 0, done = 0, active = 0;

  const feed = (w) => {
    if (next >= meta.configs) { w.terminate(); return; }
    const start = next, end = Math.min(meta.configs, next + CHUNK);
    next = end;
    w.postMessage({ meta, start, end });
  };

  const finish = () => {
    if (done !== meta.configs) { console.error(`incomplete: ${done}/${meta.configs}`); process.exit(1); }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const bytes = encodeTable(meta, scales, data);
    fs.writeFileSync(out, bytes);
    console.log(`\nwrote ${out} (${(bytes.byteLength / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  };

  for (let i = 0; i < nw; i++) {
    const w = new Worker(new URL(import.meta.url));
    active++;
    w.on('message', (m) => {
      scales.set(m.scales, m.start * M);
      data.set(m.data, m.start * perData);
      done += m.scales.length / M;
      process.stdout.write(`\r${done}/${meta.configs}`);
      feed(w);
    });
    w.on('error', (e) => { console.error(e); process.exit(1); });
    w.on('exit', () => { if (--active === 0) finish(); });
    feed(w);
  }
}