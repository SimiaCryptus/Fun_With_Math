// run.js — `node test/run.js`
import { run } from './harness.js';

await import('./hex.test.js');
await import('./game.test.js');
await import('./palette.test.js');

process.exitCode = (await run()) ? 0 : 1;
