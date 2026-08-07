# no3sieve

L∞ (Chebyshev) spiral-greedy explorer for the **no-three-in-line** problem: a browser viewer plus an in-page engine
(worker when available, time-sliced main thread otherwise). The viewer is the contract; the engine is an accelerator.

## Run it

  ```sh
  npm run serve      # http://localhost:8080/
  ```

Use the server rather than `file://`: module Workers require http (s), and over
`file://` the app silently falls back to the (correct but slower) main-thread path.

## Test it

No dependencies — the suite runs on the Node built-in test runner (Node >= 20.6):

  ```sh
  npm test               # everything, including the §7 self-test
  npm run test:watch
  npm run test:coverage
  npm run test:slow      # just the differential / self-test suite
  ```

What is covered:

| file                    | claim under test                                                                                                                                                                                                                |
  |-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `test/lattice.test.js`  | `primdir` normalisation, `linfIndex`, the ring↔perimeter **bijection** (corners exactly once, R ≤ 40), `key2` injectivity + collision refusal                                                                                   |
| `test/order.test.js`    | intra-ring orders are total permutations with lexicographic tie-breaks                                                                                                                                                          |
| `test/calendar.test.js` | event slab round-trips, growth, free-list reuse, double-free is fatal; bucket queue FIFO, same-ring re-push, overflow min-heap ordering (randomised), past/undrained guards                                                     |
| `test/sat.test.js`      | rasterise **aggregates** (never point-samples), SAT vs brute force, centered window (odd = exact L∞ ball, even = documented low bias), `scanMax` argmax + histogram + `overflow` (windows above the 2s bound are reported, not dropped) |
| `test/topk.test.js`     | top-K population, >50% overlap suppression, window extraction                                                                                                                                                                   |
| `test/verify.test.js`   | certifier vs the C(k,3) cross-product oracle, explicit triples, duplicates, non-lattice input                                                                                                                                   |
| `test/sieve.test.js`    | config normalisation refuses unimplemented switches, `convexitySplit` really is the minimiser (and both rays are monotone), **calendar engine ≡ reference engine**, paranoid I4 in both directions, seeds, I2 row/column budget |
| `test/selftest.test.js` | the in-browser self-test (§7) run headless                                                                                                                                                                                      |
| `test/sha256.test.js`   | published vectors + `node:crypto` agreement, canonical JSON totality (cycles/NaN/undefined throw), hash stability                                                                                                               |
| `test/log.test.js`      | levels, bounded history ring, `once()` per key/namespace, `check`/`invariant`/`require*`                                                                                                                                        |
| `test/viewport.test.js` | transform inverses, cursor-anchored zoom, clamping, NaN camera recovery                                                                                                                                                         |
| `test/export.test.js`   | CSV/TXT/JSON/NDJSON/manifest/curve/SVG byte-level shape; DOM-only exports fail with a clear message                                                                                                                             |
| `test/colormap.test.js` | viridis domain clamping, integral channels, monotone luminance                                                                                                                                                                  |

Randomised tests are seeded (`test/helpers.js`); a failure is always replayable.

## Logging

Level comes from `localStorage['no3sieve:log']` or `#log=debug` in the URL, and
`copy(no3sieveLog())` in the console dumps the recent ring buffer for a bug report. In tests, `setLevel('silent')` keeps
the output clean while still recording history.