# FDDP Web Implementation Plan
## A browser-native encoder/decoder for *Frequency Domain Data Patches v1.0*
### Target: static HTML + modular ES6, no build step required

---

## 0. Executive Summary

We build a single-page application that:

1. **Ingests an image** — from a file picker, drag-drop, clipboard paste, or a live
   `getUserMedia` camera frame.
2. **Encodes it to FDDP** — Profile C (`IMAGE_2D`) as the primary binding, with Profile A
   (`GENERIC_BYTE`) available for the raw file bytes of the same image.
3. **Exports** a byte-exact `.fddp` container (§15), plus optional side artefacts: a token
   grid visualisation (PNG), a JSON dump of the Effective Parameter Set (EPS), and an
   optional *visual carrier* PNG (a fiducial-marked bitmap of the container bytes).
4. **Reads FDDP back** — from a `.fddp` file, or by **scanning a visual carrier with the
   camera** — validates it, reconstructs the image at the declared reconstruction level,
   and reports the conformance/quality metrics of §17.

The deliverable is a *conforming-subset* implementation. We define our subset precisely in
§2 and log every deviation in `docs/deviations.md`. **We never silently degrade**: an
unsupported construct raises the exact error code from §19 and the UI surfaces it.

---

## 1. Design Principles (derived from the spec's own warnings)

The specification is unusually explicit about which mistakes implementers make. We encode
each of those warnings as an invariant enforced by code *and* by a test:

| Spec warning                                                  | Invariant                                                                                             | Enforced in                                |
|---------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|--------------------------------------------|
| §10.2 — area-average on **linear** magnitudes, never on logs  | `resample()` takes linear magnitudes and asserts its input is pre-log                                 | `dsp/resample.js`, test `energy.test.js`   |
| §11.1 — running stats update **after** the patch is emitted   | Orchestrator calls `updateStats()` only in the post-emit hook                                         | `enc/encoder.js`, test `causality.test.js` |
| §11.3 — rounding is **round-half-to-even**                    | Single `roundHalfEven()` helper; `Math.round` is banned by lint rule                                  | `core/roundeven.js`                        |
| §16.3 V2 — DCT-II half-sample offset                          | Golden vectors V1/V2 run on every CI pass and on app boot in dev mode                                 | `dsp/dct.js`, `tests/vectors.test.js`      |
| §10.1 — degenerate bands merged, **merged** edges transported | `BAND` chunk is written from the merged array only; the generating rule is never re-derived at decode | `dsp/bands.js`                             |
| §11.2 — side-channel is mandatory                             | Patch serialiser cannot emit a body without an 8-byte side-channel                                    | `container/writer.js`                      |
| §18.1 — header counts are advisory                            | Decoder reconciles `token_count` against `DATA` length before allocating                              | `container/reader.js`                      |
| §11.4 — never substitute a missing codebook                   | `FDDP_E_CODEBOOK_MISSING` thrown, no fallback path exists                                             | `dec/dequantize.js`                        |
| §4.3 — flush denormals                                        | Explicit `ftz()` on lane output; also a side-channel mitigation (§18.3)                               | `enc/lanes.js`                             |

Two further project-level principles:

- **Pure core, impure shell.** Everything in `src/core`, `src/dsp`, `src/enc`, `src/dec`,
  `src/container` is a pure function of typed arrays and a plain-object EPS. DOM, camera,
  workers, and file I/O live only in `src/app`, `src/io`, `src/workers`.
- **The EPS is the only configuration.** No module reads a global. `resolveEPS(profile,
  overrides)` produces a frozen object; every stage takes it as an argument. This is what
  makes the §3 "byte-identical given identical EPS" requirement testable.

---

## 2. Conformance Scope

### 2.1 Target class

We implement **Core** (§16.1) plus a deliberately chosen slice of **Full**:

| Feature                                    | Status                 | Notes                                                     |
|--------------------------------------------|------------------------|-----------------------------------------------------------|
| Profile A `GENERIC_BYTE`                   | ✅ required by §6.1    | applied to the raw encoded image file bytes               |
| Profile C `IMAGE_2D`                       | ✅ primary             | the reason the app exists                                 |
| Profile B / D / E                          | ⛔ phase 9+            | E is attractive (§9.4 coherence) but has no image story   |
| Transform `0x01` DCT-II                    | ✅                     | 1-D and 2-D separable (`0x08`)                            |
| Transform `0x02` rFFT                      | ✅                     | needed for Profile A alternates + Griffin–Lim L1          |
| Transform `0x05` WHT                       | ✅ phase 8             | the only practical route to L3 bit-exact                  |
| Transforms `0x03 0x04 0x06 0x07`           | ⛔                     | reject with `FDDP_E_PARAM`                                |
| `S` (scales)                               | 1 for C, up to 3 for A | §10.3 pyramid implemented but off by default              |
| `L` (lanes)                                | ≤ 64                   | Core limit                                                |
| Anchoring FIXED                            | ✅                     | mandatory for Profile C raster order                      |
| Anchoring CDC                              | ✅ phase 7             | Profile A only; §17.3 score is a headline demo            |
| Quant `NONE`, `AFFINE_INT8`, `AFFINE_INT4` | ✅                     |                                                           |
| Quant `MU_LAW8`, `VQ`, `RVQ`               | ⛔                     | `VQ` decode stub raises `FDDP_E_CODEBOOK_MISSING`         |
| Reconstruction L0 / L1 / L2                | ✅                     | L2 only in the configurations of §2.3                     |
| Reconstruction L3                          | ✅ stretch (phase 8)   | WHT + reversible YCoCg-R + `QUANT=NONE` + `RAGGED`        |
| Streaming §14                              | partial                | camera-frame-per-container; no sub-frame commit machinery |
| `XTRA/PROV` signing                        | ✅ phase 8             | Ed25519 via WebCrypto; verification failure is fatal      |

### 2.2 The Profile C ⇄ 1-D model binding

Profile C (§6.3) is specified against a pipeline whose vocabulary is temporal. We must fix
an explicit binding and **record it in an ancillary `XTRA/IMGD` chunk** so a decoder is
never guessing. The binding:

| Spec concept      | Image realisation                                                     |
|-------------------|-----------------------------------------------------------------------|
| canonical stream  | `W×H×3` u8, row-major, RGB, after `PAD_REFLECT` to a multiple of 16   |
| lane `l`          | one colour plane after RGB→YCoCg-R: `l=0:Y, l=1:Co, l=2:Cg`           |
| frame `t`         | one 16×16 block, raster-ordered: `t = by·Wb + bx`, `Wb = W_pad/16`    |
| window            | rectangular (`0x00`) — blocks do not overlap, `H = N`                 |
| transform         | `0x08` separable 2-D DCT-II, orthonormal, `K = 256`                   |
| bin `k`           | zig-zag index of the coefficient within the block (§ `dsp/zigzag.js`) |
| band `j`          | contiguous run of zig-zag indices ≈ a radial ring (§2.4)              |
| time group `g`    | a 2×2 block quad: `g = (by>>1)·(Wb/2) + (bx>>1)`, `G = 4`             |
| intra-group order | row-major within the quad: `(0,0),(0,1),(1,0),(1,1)`                  |
| segment           | 1 (FIXED anchoring)                                                   |

`XTRA/IMGD` payload: `u32 width, u32 height, u32 width_pad, u32 height_pad, u8 colour_xform,
u8 block_size, u8 group_w, u8 group_h, u8 reserved[4]`.

`H = N` means §7.4's COLA check is trivially satisfied with a rectangular window and
`p = 1` — the overlap-add in §13.2 step 6 degenerates to a copy. We still run the numeric
COLA verifier so the code path is exercised.

### 2.3 Reconstruction feasibility — an honest analysis

This is the single most important engineering finding to settle *before* writing code,
because it determines the presets we ship.

**`RESAMPLE_FIXED` cannot reach L2.** §10.2 area-averages a band down to `K_p` slots;
§13.2 step 3 expands by nearest-neighbour with an energy rescale. For our band 9
(zig-zag 136…256, 120 coefficients → 16 slots) that is a 7.5:1 decimation. Band energy is
preserved exactly (§17.1) but individual coefficients are not, so the relative RMS error
is O(1) in the high rings. L2's `≤1e-4` is unreachable. Therefore:

> **`RESAMPLE_FIXED` containers MUST declare L0 or L1.** The encoder computes the actual
> reconstruction error and refuses to write a `reconstruction_level` it cannot honour.

**Log-domain int8 quantisation is coarser than it looks.** With
`v = sgn(X)·(ln(|X|+δ) − ln δ)` and `δ = 1e-6`, `d|X|/dv = |X| + δ`, so an absolute error
`Δ/2` in `v` is a **relative** error of ≈`Δ/2` in the coefficient. Global-range int8
(`v ∈ [−14, 14]`, `Δ ≈ 0.11`) ⇒ ~5.5 % per-coefficient error — visible ringing.
Per-patch `PATCH_Z` shrinks the in-patch spread (coefficients within one ring of one block
quad are of similar magnitude, σ ≈ 1.5–2.5 nats), giving `Δ ≈ 0.05` ⇒ ~2.5 %. Acceptable
for a perceptual preset, not for L2. Measured, not assumed: `tests/quant_error.test.js`
reports the curve and the UI shows it.

Consequently we ship **four presets**, each with an enforced, *measured* level:

| Preset              | Tiling                    | Channels            | Norm      | Quant         | Declared level                         | Use                                                 |
|---------------------|---------------------------|---------------------|-----------|---------------|----------------------------------------|-----------------------------------------------------|
| `analysis`          | `RESAMPLE_FIXED` `K_p=16` | `SIGNED_LOGMAG`     | `PATCH_Z` | `AFFINE_INT8` | **L1**                                 | token grid for models; the spec's Profile C default |
| `analysis-tiny`     | `RESAMPLE_FIXED` `K_p=4`  | `SIGNED_LOGMAG`     | `PATCH_Z` | `AFFINE_INT4` | **L0**                                 | fits a visual carrier (§7)                          |
| `visual`            | `RAGGED`                  | `SIGNED_LOGMAG`     | `PATCH_Z` | `AFFINE_INT8` | **L1** (measured; often ≈ L2-adjacent) | photo round-trip demo                               |
| `faithful`          | `RAGGED`                  | `SIGNED_LOGMAG`     | `NONE`    | `NONE` (f16)  | **L2** (verified ≤1e-4)                | correctness demo                                    |
| `exact` *(phase 8)* | `RAGGED`                  | `SIGNED_LOGMAG`→raw | `NONE`    | `NONE` (i32)  | **L3**                                 | WHT + YCoCg-R, byte-equal                           |

A private-use channel `0x80 LINEAR_PEAK` (`X / max|X|` in the band, no log) is defined for
experimentation with the `visual` preset. §20 reserves `0x80–0xFE` for private use and
forbids them in interchange containers, so the writer sets an `XTRA/PROV` note and the UI
labels such exports **"non-interchange"** in red.

### 2.4 Band edges for 16×16 blocks

§6.3 asks for "10, zig-zag radial rings". True radial rings (`⌊√(k_r²+k_c²)⌋`) are *not*
contiguous in zig-zag order, and §10.1 demands contiguous non-overlapping bands over the
bin index. Two resolutions:

- **Chosen:** bin index *is* the zig-zag index; bands are contiguous zig-zag runs whose
  edges are the triangular numbers (which approximate rings to within one diagonal),
  merged per §10.1 to exactly 10 bands, and transported as `BAND` scheme `0x07 EXPLICIT`:

      edges = [0, 1, 3, 6, 10, 15, 21, 36, 66, 136, 256]   ⇒ J = 10

- Rejected: transport a permutation of the 256 bins in `XTRA` and use scheme `0x06 RADIAL`.
  It is more faithful to "rings" but adds a non-standard indirection at decode. Documented
  in `docs/deviations.md` as deviation **D-03**.

---

## 3. Repository Layout

No bundler, no transpiler. Served by any static host; `index.html` uses an import map so
module specifiers stay clean and a bundler can be added later without touching sources.

    fddp-web/
      index.html                  # shell, import map, <template>s for panels
      styles.css
      docs/
        conformance.md            # which MUSTs we satisfy, per §16 class
        deviations.md             # D-01… numbered, each with rationale + spec cite
        carrier.md                # FDDP-VC/1 visual carrier spec (§7)
      src/
        core/
          errors.js               # FddpError + the §19 code table, frozen
          registry.js             # every §5/§7/§8/§9/§10/§11 ID table as frozen maps
          eps.js                  # resolveEPS(), validateEPS(), freeze, hash
          profiles.js             # A, C (+ stubs B/D/E throwing FDDP_E_PROFILE)
          roundeven.js            # roundHalfEven(x) — the only rounding in the codebase
          f16.js                  # f32<->f16 (Float16Array when available)
          bits.js                 # BitWriter/BitReader, LSB-first, int4 packing
          crc32c.js               # Castagnoli, reflected, table-driven (App. A.4)
          digest.js               # sha256 via crypto.subtle (+ sync fallback for tests)
          splitmix.js             # splitmix64 + Gear table (App. A.1), BigInt
          xoshiro.js              # xoshiro256** for test-vector generation (§16.3)
          assert.js               # dev-mode invariants, compiled out via ?dev flag
        dsp/
          windows.js              # §7.3 table + COLA/WOLA verifier (§7.4)
          dct.js                  # dct2/dct3 1-D (O(N log N) via FFT) + 2-D separable
          fft.js                  # radix-2/4 complex FFT, rfft/irfft wrappers
          wht.js                  # sequency-ordered Walsh–Hadamard (phase 8)
          zigzag.js               # forward/inverse zig-zag permutation for any block size
          bands.js                # §10.1 schemes, merge rule, edge validation
          resample.js             # linear-domain area average + NN expand w/ energy rescale
          griffinlim.js           # L1 phase estimation (§13.1), used by Profile A demos
        enc/
          canonicalize.js         # §4.1 per input class; source_digest
          colorspace.js           # RGB<->YCoCg-R (reversible, integer)
          lanes.js                # §5 lane projections + MASK + ftz
          framing.js              # §7 blocks/frames, padding policies, geometry math
          channels.js             # §9 channel construction, princ(), t=0/k=0 zeroing
          tiling.js               # §10.2 patch extraction, emission order (§10.4)
          normalize.js            # §11.1 modes + causal EMA state object
          quantize.js             # §11.3 schemes
          encoder.js              # S0..S7 orchestrator, emits patch records
        container/
          chunks.js               # chunk read/write primitives + CRC
          fhdr.js                 # §15.5 pack/unpack
          writer.js               # S8/S9: assemble FHDR..IEND, patch packing (§15.6)
          reader.js               # streaming-tolerant parser, limits of §18.1
          layout.js               # patchStride(), patchOffset(i) — random addressing
        dec/
          decoder.js              # inverse orchestrator (§13.2)
          dequantize.js
          denormalize.js          # incl. causal EMA replay
          untile.js               # §13.2 step 3
          inverse.js              # spectrum recompose + inverse transform + OLA
          metrics.js              # §17.1–17.5 scores, PSNR/SSIM for the UI
        carrier/                  # phase 5–6, see §7
          spec.js                 # cell grid geometry, versions, capacity table
          render.js               # bytes -> ImageData (fiducials, timing, ECC, fountain)
          detect.js               # finder-pattern search, homography, grid sampling
          rs.js                   # Reed–Solomon GF(256) encode/decode
          fountain.js             # LT/RaptorQ-lite for multi-frame payloads
        io/
          imageLoad.js            # File/Blob/clipboard -> ImageData via createImageBitmap
          camera.js               # getUserMedia lifecycle, frame pump, torch/focus hints
          download.js             # Blob -> <a download>, File System Access when present
        app/
          main.js                 # bootstrap, feature detection, dev self-test
          state.js                # tiny observable store (no framework)
          ui/
            encodePanel.js
            decodePanel.js
            inspectorPanel.js     # chunk tree, EPS diff, hex view
            tokenGrid.js          # canvas visualisation of the patch grid
            metricsPanel.js
            cameraPanel.js
            errorToast.js
        workers/
          encode.worker.js
          decode.worker.js
          carrier.worker.js
      tests/
        index.html                # in-browser runner (same ESM, no build)
        run-node.mjs              # node --test entry, imports the same modules
        vectors/                  # V1, V2, golden SHA-256 manifests (§16.3)
        *.test.js

### 3.1 Module contracts (stable signatures)

~~~js
// core/eps.js
export function resolveEPS(profileId, overrides = {}) -> Readonly<EPS>   // throws FddpError
export function epsDigest(eps) -> Promise<Uint8Array>                    // SHA-256, for §3 reproducibility tests

// enc/encoder.js
export async function encode(input, eps, hooks = {}) -> EncodeResult
//  input : { kind:'image', imageData } | { kind:'bytes', bytes }
//  hooks : { onProgress(frac), onPatch(patchRecord) }   // onPatch enables streaming write
//  EncodeResult : { patches: PatchRecord[], meta, stats, bandEdges, tokenCount }

// PatchRecord (the interchange unit between enc/ and container/)
//  { coord:{ s, l, g, j, segment }, side:{ mean, logScale, validFrac, flags, cohere },
//    body: Float32Array | Int8Array | Uint8Array, bodyBits: 4|8|16|32 }

// container/writer.js
export function writeContainer(encodeResult, eps, extras) -> Uint8Array

// container/reader.js
export function readContainer(bytes, { strict = true }) -> ParsedContainer   // throws FddpError
//  ParsedContainer : { fhdr, lane, xfrm, band, chan, norm, quan, segs, dataView, stat, xtra[] }

// dec/decoder.js
export async function decode(parsed, { level = 'auto' }) -> DecodeResult
//  DecodeResult : { imageData?, bytes?, achievedLevel, metrics }
~~~

---

## 4. Phased Delivery

Each phase ends with a demo that a stranger can run and a test suite that passes in both
the browser runner and `node --test`.

### M0 — Skeleton & numeric foundations  *(≈ 1 day)*

- `index.html` with import map; `app/main.js` boots, feature-detects
  `createImageBitmap`, `OffscreenCanvas`, `crypto.subtle`, `Float16Array`,
  `navigator.mediaDevices`, and prints a capability table.
- `core/roundeven.js`, `core/f16.js`, `core/bits.js`, `core/crc32c.js`,
  `core/digest.js`, `core/splitmix.js`, `core/errors.js`.
- **Acceptance:** CRC-32C of `"123456789"` = `0xE3069283`; `roundHalfEven(0.5)=0`,
  `(1.5)=2`, `(2.5)=2`, `(-0.5)=-0`; f16 round-trip for the full 65 536-code space;
  Gear table entry 0 matches an independently computed splitmix64.

### M1 — Transforms & the normative test vectors  *(≈ 2 days)*

- `dsp/fft.js`: iterative radix-2 complex FFT with precomputed twiddles, plus `rfft`.
- `dsp/dct.js`: **orthonormal DCT-II** and its inverse DCT-III. Implement the naive O(N²)
  kernel *first* as the reference, then the FFT-accelerated version, and assert they agree
  to `1e-12` — this is how we avoid the §16.3 V2 half-sample trap.
- `dsp/dct.js` 2-D separable: rows then columns, orthonormal both ways.
- `dsp/windows.js` with the full §7.3 table and the numeric COLA/WOLA verifier
  (`1e-7` tolerance, throws `FDDP_E_COLA_VIOLATION`).
- **Acceptance (blocking):**
    - **V1** `N=8`, rect, x=1 ⇒ `[2.82842712, 0×7]`.
    - **V2** `N=8`, rect, `x[n]=cos((π/8)(n+½)·2)` ⇒ `[0,0,2.0,0,0,0,0,0]`.
    - Parseval: `‖DCT(x)‖² = ‖x‖²` to `1e-12` for random x, N ∈ {8…4096}.
    - 2-D: DCT then IDCT of a random 16×16 block reproduces input to `1e-12`.
    - `1e-5` RMS vs. a float64 reference over the §16.3 style random corpus (§8.3).

### M2 — Encode path for images (`analysis` preset)  *(≈ 3 days)*

- `io/imageLoad.js`: File → `ImageBitmap` → `ImageData` via `OffscreenCanvas`
  (fallback: `<canvas>`), EXIF orientation applied, alpha composited over white and the
  fact recorded in `XTRA/IMGD`.
- `enc/colorspace.js`: reversible integer YCoCg-R with range extension
  (`Co, Cg ∈ [−255, 255]` — 9-bit planes; lanes are `EXOGENOUS`-style pass-throughs scaled
  to `[−1, 1]`, *not* `U8_CENTERED`, and the scale is recorded per lane).
- `enc/framing.js`: pad to 16-multiples (`PAD_REFLECT`), block extraction, geometry math
  mirroring §7.1 (`T`, `M_pad`) in 2-D.
- `dsp/zigzag.js`, `dsp/bands.js` (edges + merge + `FDDP_E_BAND_DEGENERATE`).
- `enc/channels.js`: `SIGNED_LOGMAG` with `δ` from App. A.3 by payload precision.
- `enc/tiling.js`: ragged and resampled tile extraction in the **canonical emission order**
  of §10.4.
- `dsp/resample.js`: area average over linear magnitudes, before log.
- `enc/normalize.js` (`PATCH_Z`, `PEAK`, `NONE`, `GLOBAL_Z`, `RUNNING_Z` with the exact
  §11.1 EMA update), `enc/quantize.js` (`NONE/INT8/INT4`).
- **Acceptance:**
    - §17.1 energy preservation ≤ `1e-5` for `RESAMPLE_FIXED` on 100 random blocks.
    - Deliberately averaging in the log domain makes that test fail (negative control).
    - Emission-order test: patch index → `(s,l,g,j)` inverse mapping is a bijection.
    - Re-running `encode()` twice yields byte-identical patch payloads (§3).

### M3 — Container write & read  *(≈ 2 days)*

- `container/chunks.js` (`length | type | payload | crc32c`), critical/ancillary bit test.
- `container/fhdr.js` exactly per the §15.5 offset table, RESERVED zeroed and verified.
- `writer.js`: `FHDR, LANE, XFRM, BAND, CHAN, NORM, QUAN, [POSI], DATA…, XTRA/IMGD, STAT,
  IEND`. DATA split at 8 MiB boundaries; **patches never straddle chunk boundaries** so
  `layout.js` addressing stays valid.
- §15.6 packing: `side(8) ‖ body`, per-patch zero-pad to an octet for INT4.
- `reader.js`: validates signature, per-chunk CRC, unknown-critical rejection,
  ancillary skip, §18.1 resource limits, `token_count` reconciliation.
- `app/ui/inspectorPanel.js`: chunk tree + hex viewer + decoded FHDR fields.
- **Acceptance:**
    - Round-trip: `readContainer(writeContainer(x)) ≡ x` structurally.
    - Corrupt one payload byte ⇒ `FDDP_E_CRC`; truncate ⇒ `FDDP_E_TRUNCATED`;
      inject chunk `ZZZZ` (bit 5 of byte 0 clear) ⇒ `FDDP_E_UNKNOWN_CRITICAL`;
      inject `zZZZ` ⇒ skipped silently.
    - Golden SHA-256 of the `DATA` payload for a fixed xoshiro-generated input is recorded
      in `tests/vectors/manifest.json` and frozen from here on.

### M4 — Decode & reconstruction  *(≈ 3 days)*

- Inverse pipeline in the §13.2 order, including the `RUNNING_Z` causal replay.
- `untile.js`: NN expand + **energy rescale so band energy matches exactly**.
- `inverse.js`: `|X| = δ(e^{|v|} − 1)`, sign restored, IDCT-2D, un-pad, YCoCg-R⁻¹,
  clamp to `[0,255]` with the clamp count reported (not hidden).
- `dec/metrics.js`: relative RMS (§13.1), PSNR, SSIM, spectral convergence (§17.4),
  `bits_per_source_octet` (§17.5), plus per-band error breakdown.
- **Encoder self-verification:** `encode()` optionally runs `decode()` internally and
  **downgrades the declared `reconstruction_level`** if the measured error misses the
  threshold. A container never claims a level it did not demonstrate.
- **Acceptance:**
    - `faithful` preset ⇒ relative RMS ≤ `1e-4` on the test images (L2 verified).
    - `analysis` preset ⇒ L1 spectral convergence ≤ 0.25; declared level is L1.
    - Side-by-side UI: original / reconstruction / 8× amplified error map.

### M5 — Camera capture (encode side)  *(≈ 1 day)*

- `io/camera.js`: enumerate devices, `getUserMedia({video:{width:{ideal:1920}}})`,
  permission-denied and `NotReadableError` handling, `ImageCapture` when available,
  fallback to drawing `<video>` into an `OffscreenCanvas`.
- Capture → same `ImageData` path as file load. Live preview of token count and estimated
  container size as resolution/preset sliders move.
- **Acceptance:** capture → encode → export works on desktop Chrome/Firefox/Safari and on
  mobile Safari/Chrome; permission revocation mid-session is recovered gracefully.

### M6 — Export & visualisation  *(≈ 1 day)*

- `.fddp` download (`io/download.js`), plus `File System Access` save-picker when present.
- Token-grid canvas: rows = `(lane, band)`, columns = time-group, cell colour = patch
  energy; hover shows the coordinate, the side-channel, and the first 16 body values.
- EPS export as JSON (and as a shareable URL fragment for reproducibility).
- **Acceptance:** exported file re-imports into the decode panel and matches the in-memory
  result byte-for-byte.

### M7 — Visual carrier: render + still-image read  *(≈ 3 days)*  → see §7
### M8 — Visual carrier: live camera read  *(≈ 3 days)*  → see §7

### M9 — Stretch  *(open-ended)*

- CDC anchoring (§4.2) + the §17.3 shift-invariance demo on Profile A over the image's
  raw file bytes: insert 1/4/16 bytes, show Jaccard `FIXED ≈ 0.05` vs `CDC ≥ 0.90`. This
  is the most persuasive single demo in the whole spec and costs only a rolling hash.
- WHT + `QUANT=NONE` + reversible YCoCg-R ⇒ **L3 byte-exact** image mode.
- Multi-scale pyramid (`S=3`) for Profile A.
- `XTRA/PROV` Ed25519 detached signatures over the §18.4 signature input.
- Profile E toy: treat image rows as "group series" and compute cross-lane coherence, just
  to exercise §9.4. Clearly labelled as a demo, not a profile claim.

---

## 5. Detailed Implementation Notes

### 5.1 DCT-II, the part everyone gets wrong

Reference kernel (ship it, keep it, test against it forever):

~~~js
// dsp/dct.js — reference, O(N^2), used only in tests and for N <= 64
export function dct2Ref(x) {
  const N = x.length, X = new Float64Array(N);
  const a0 = Math.sqrt(1 / N), ak = Math.sqrt(2 / N);
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let n = 0; n < N; n++) s += x[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    X[k] = (k === 0 ? a0 : ak) * s;          // the (n + 0.5) is V2's whole point
  }
  return X;
}
~~~

Fast path: the standard even/odd reordering into an `N`-point complex FFT
(`y[n]=x[2n]`, `y[N-1-n]=x[2n+1]`, then multiply by `2·e^{−iπk/2N}` and take the real part),
scaled to orthonormal. Both paths must reproduce V1 and V2; the app's dev mode asserts this
at boot so a regression can never ship silently.

2-D separable: `X = D · x · Dᵀ` executed as rows-then-columns with a reusable scratch
buffer. For 16×16 the `O(N²)` kernel with a precomputed 16×16 cosine matrix is faster than
any FFT and is what we actually use; the FFT path exists for Profile A's `N = 1024`.

### 5.2 Band handling

~~~js
// dsp/bands.js
export function bandEdges(scheme, { K, J, kMin = 0, kMax = K, explicit }) -> Uint32Array
export function mergeDegenerate(edges) -> Uint32Array   // §10.1: merge empty bands forward
export function validateEdges(edges, K) // monotone, non-empty, covers [kMin,kMax) exactly
~~~

`mergeDegenerate` is applied **once**, at EPS resolution time; the merged array is the only
one that reaches `BAND` or the tiler. The nominal `J` from the profile is discarded — §21
makes exactly this point for Profile A (16 nominal → 11 actual). Our Profile C binding has
no degenerate edges at `K = 256`, but Profile A on small sources does, and the test suite
reproduces §21's `[0,1,2,4,…,1024] ⇒ J = 11` result exactly.

### 5.3 Resampling and its inverse

~~~js
// dsp/resample.js
// Forward: linear magnitudes in, K_p slots out, exact area (energy) preservation.
export function areaAverage(lin, k0, k1, Kp, out)   // fractional-coverage weights
// Inverse: NN expand then rescale so that sum(out^2) over the band equals the decoded
// band energy exactly (§13.2 step 3).
export function expandNN(slots, k0, k1, targetEnergy, out)
~~~

The forward function must accept **linear magnitudes** and is given a distinct parameter
name (`lin`) plus a dev-mode assertion that no value is negative and the max is not
suspiciously small (the signature of accidentally passing logs). §17.1's test is the real
guard; the assertion just localises the failure.

### 5.4 Normalization state

~~~js
// enc/normalize.js
export class NormState {
  constructor(eps)                      // allocates [L][J][C][2] for GLOBAL_Z / RUNNING_Z
  apply(tile, coord) -> { tile, side }  // pure w.r.t. state
  update(tile, coord)                   // MUST be called only after the patch is emitted
}
~~~

The orchestrator's loop is written so the ordering cannot be inverted by accident:

~~~js
const { tile: norm, side } = normState.apply(tile, coord);
const body = quantize(norm, eps);
emit({ coord, side, body });          // observable effect happens here
normState.update(norm, coord);        // and only then does state move
~~~

A test drives 1 000 patches with `RUNNING_Z` and asserts the decoder's replayed statistics
match the encoder's at every index — if the order is swapped, the sequences diverge at
patch 1 and the test fails immediately.

### 5.5 Quantization

~~~js
// enc/quantize.js
// AFFINE_INT8: Δ chosen from the patch's max-abs so that the full int8 range is used;
// z = 0 for symmetric data (SIGNED_LOGMAG is symmetric). Δ is carried in side.logScale
// as f16 (log2 Δ), which is exactly what §11.2's log_scale field is for.
export function affineInt8(tile) -> { q: Int8Array, delta, zero }
export function affineInt4(tile) -> { packed: Uint8Array, delta, zero } // LSB-first, low nibble first
~~~

Every `round` in these functions is `roundHalfEven`. A dedicated vector feeds exact `.5`
values at every code point and compares against a table computed by hand.

### 5.6 Container writing

- All integers little-endian via `DataView`.
- Chunk CRC covers `type ‖ payload`, not `length` (§15.3).
- `FHDR.token_count` is written after the DATA pass (two-pass writer, or a patch-back into
  a reserved slot). The reader treats it as advisory regardless (§18.1).
- `STAT` carries `source_length`, `source_digest` (SHA-256 of the canonical stream),
  `nonfinite_count`, `clamp_count`, encoder identifier `"fddp-web/<version>"`, and the
  measured metrics — useful, ancillary, skippable.
- `layout.js` exposes `patchOffset(i)` so the inspector can jump to patch *i* by
  arithmetic, which is the property §15.6's per-patch padding rule exists to preserve. A
  test picks 100 random indices and checks the computed offset against a linear scan.

### 5.7 Error surfacing

~~~js
// core/errors.js
export class FddpError extends Error {
  constructor(code, detail, context)    // code ∈ the frozen §19 table
}
~~~

Every throw site names a §19 code. The UI toast shows `code — human message — spec §`.
There is no `catch { /* best effort */ }` anywhere in `src/core|dsp|enc|dec|container`;
§19 says no error has a defined continuation, and that is enforced by review checklist and
a lint rule banning empty catch blocks in those directories.

---

## 6. Performance & Threading

Budget for a 4000×3000 phone photo, `analysis` preset:

- blocks: `250 × 188 = 47 000` per plane × 3 planes = 141 000 block DCTs of size 16×16.
- Each 2-D DCT via matrix multiply: `2 · 16³ = 8 192` MACs ⇒ ~1.2 GFLOP total. In plain
  JS with typed arrays that is roughly 1–3 s single-threaded — acceptable, but not on the
  main thread.
- groups: `125 × 94 = 11 750`; tokens `= 11 750 × 3 × 10 = 352 500`. That **exceeds**
  `MAX_TOKENS = 2^24`? No: `2^24 = 16.7 M`, so we are fine, but the check runs first
  anyway (§10.3), before any allocation.
- DATA size: `352 500 × (8 + 4·16·1) = 352 500 × 72 = 25.4 MB` over a 36 MB source ⇒
  `bits_per_source_octet ≈ 5.6`. The UI shows this number prominently next to §17.5's note
  that Profile A's ≤2.0 target is profile-specific; for Profile C we document our own
  target of **≤ 6.0 at `K_p=16`, ≤ 1.7 at `K_p=4` + INT4**.

Measures:

- Both encode and decode run in **Workers**; `ImageData.data.buffer`, and all result
  buffers, move by **transfer**, never by structured clone of large arrays.
- Pre-allocate per-worker scratch (`Float32Array` block buffer, tile buffer, output ring)
  and reuse; zero allocation inside the block loop.
- Progress is reported per row-of-blocks so the UI stays responsive and cancellable
  (`AbortSignal` checked between rows).
- A downscale-before-encode control (default: longest edge ≤ 1600 px) with an explicit
  "full resolution" opt-in, because most users want the demo, not the 25 MB file.
- Optional WASM SIMD DCT kernel is *out of scope for v1* but the module boundary
  (`dsp/dct.js` exporting a `setKernel()` hook) is designed so it can be dropped in.

---

## 7. Reading via Camera — the Visual Carrier (`FDDP-VC/1`)

Two distinct "read with the camera" capabilities exist, and conflating them is the main
design risk. We build both, in order.

### 7.1 Mode 1 — camera as an *image source* (M5, easy)

The camera supplies pixels that we **encode**. No optical decoding involved. Ships first.

### 7.2 Mode 2 — camera as a *container reader* (M7/M8)

To read an FDDP container optically we must render its bytes as a scannable bitmap. QR
tops out around 3 KB, so a general container will not fit in one frame. Design:

**Geometry.** Square cell grid, versioned. Version *v* has `n = 33 + 16v` cells per side.
Four 7×7 concentric-square finder patterns at the corners (asymmetric: the bottom-right
one is 5×5, giving unambiguous orientation), a 1-cell timing pattern along two edges, a
4-cell quiet zone, and a 24-bit format block (version, ECC level, frame index, total
frames) protected by a BCH code and repeated at two corners.

**Modulation.** v1: **binary** (black/white) — maximum camera robustness.
v2 (optional): 2 bits/cell via four grey levels, requiring a per-frame calibration strip.

**ECC.** Reed–Solomon over GF(256), RS(255,223) by default (12.5 % overhead, corrects 16
byte errors per block), interleaved to depth 8 so a specular highlight damaging a
contiguous region spreads across blocks.

**Capacity.**

| Version | Cells/side | Payload cells | Raw bytes | After RS(255,223) |
|---------|------------|---------------|-----------|-------------------|
| 1       | 49         | ≈ 2 100       | 262       | ≈ 229             |
| 4       | 97         | ≈ 8 800       | 1 100     | ≈ 960             |
| 8       | 161        | ≈ 24 900      | 3 112     | ≈ 2 720           |
| 12      | 225        | ≈ 49 300      | 6 162     | ≈ 5 390           |

A 1080p camera can reliably resolve ~4 px/cell ⇒ version 12 at 225 cells needs ~900 px of
the frame. Workable but demanding; version 8 is the default.

**Multi-frame.** Payloads above one frame's capacity are split and displayed as an animated
sequence. Rather than requiring every frame to be caught, we use **LT fountain coding**:
each displayed frame is a XOR of a pseudo-random subset of source blocks (degree drawn
from a robust soliton distribution, seeded by the frame index, so the receiver can
reconstruct the subset from the header alone). The reader accumulates frames and runs
belief propagation until decoding completes — typically `1.05–1.15 ×` the source block
count, in any order, with dropouts tolerated. The UI shows a completion percentage.

**Right-sizing the payload.** For the demo to be pleasant the container must be small, so
the carrier path defaults to the `analysis-tiny` preset at a 128×128 downscale:

    blocks 8×8 per plane = 64; groups (2×2) = 16; lanes 3; bands 10
    tokens = 16 × 3 × 10 = 480
    body   = G(4) × K_p(4) × C(1) = 16 values @ int4 = 8 bytes
    patch  = 8 (side) + 8 (body) = 16 bytes
    DATA   = 480 × 16 = 7 680 bytes  + ~400 bytes of headers ≈ 8 KB

8 KB ⇒ three version-8 frames, or a single version-14 still. Both are demonstrated. The
reconstruction from `analysis-tiny` is a recognisable, blocky 128×128 image — which is
exactly the honest outcome for L0 and is labelled as such.

### 7.3 Detection pipeline (`carrier/detect.js`)

1. Grab frame → grayscale (`Uint8ClampedArray`, luma only).
2. Downsample ×2 for candidate search; **adaptive threshold** (integral-image mean over a
   `w/8` window, offset −7).
3. Run-length scan rows for the `1:1:3:1:1` finder signature; cross-check columns;
   cluster centres.
4. Choose the best 4-point set (three 7×7 + one 5×5) by geometry plausibility; reject if
   the quadrilateral is too skewed or too small.
5. Solve the 8-DOF **homography** from the four centres (plus timing-pattern refinement)
   with a direct linear transform and one Gauss–Newton refinement step.
6. Sample each cell centre in the *original-resolution* frame with bilinear interpolation;
   threshold against a locally interpolated black/white reference derived from the timing
   pattern.
7. Unmask, de-interleave, RS-decode. Failures at this point are *expected* and cheap —
   just try the next frame. Only report an error after N consecutive failures with a
   detected-but-undecodable grid.
8. Feed decoded blocks into the fountain decoder; when complete, hand the assembled bytes
   to `container/reader.js` — which runs its **full CRC and structural validation**, so an
   optical bit error that survives RS still cannot produce a silently wrong image.

Everything from step 2 onward runs in `carrier.worker.js` on transferred frame buffers;
the main thread only pumps frames and draws the overlay (detected quad, per-frame status,
fountain progress).

### 7.4 Rendering (`carrier/render.js`)

Produces an `ImageData` at an integer cell scale (default 8 px/cell) with the quiet zone,
plus a caption strip (human-readable: profile, tokens, size, digest prefix). Exported as
PNG and, for multi-frame, as an on-screen animation at a configurable rate (default 6 fps;
a "step manually" mode exists for photographing individual frames).

### 7.5 Fallbacks

- **Still-photo read** (M7) precedes live camera (M8): drop a photo of a carrier into the
  decode panel and the same detection pipeline runs once. This de-risks the hard part
  (geometry) before adding the real-time part (frame pumping, exposure, motion blur).
- If no camera permission is available, the decode panel still accepts `.fddp` files and
  carrier PNGs. The feature matrix degrades visibly, never silently.

---

## 8. UI Specification

Single page, three tabs, one persistent status bar.

    ┌──────────────────────────────────────────────────────────────────────────┐
    │ FDDP Web   [ Encode ] [ Decode ] [ Inspect ]        caps: ✓WASM ✓cam …   │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ ENCODE                                                                   │
    │  Source:  ( ) File  ( ) Camera  ( ) Clipboard        [ preview canvas ]  │
    │  Profile: [ C IMAGE_2D ▾ ]   Preset: [ analysis ▾ ]                      │
    │  ▸ Advanced (overrides, each logged into the EPS as an explicit override) │
    │      block 16 ▾   K_p 16 ▾   G 2×2 ▾   quant INT8 ▾   norm PATCH_Z ▾     │
    │      bands: [0,1,3,6,10,15,21,36,66,136,256]  (merged, 10 bands)         │
    │  Estimate:  352 500 tokens · 25.4 MB · 5.64 bits/source-octet            │
    │  [ Encode ]  ▓▓▓▓▓▓▓░░░ 68 %  [cancel]                                   │
    │  Result:  level L1 (verified) · SC −14.2 dB · energy err 3e−7            │
    │  [ Download .fddp ] [ Download carrier PNG ] [ Copy EPS JSON ]           │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ token grid (canvas)   |   original | reconstruction | error ×8           │
    └──────────────────────────────────────────────────────────────────────────┘

**Decode tab:** drop zone for `.fddp` / carrier PNG, plus a "Scan with camera" button that
opens the live view with a detection overlay and fountain progress ring. On success:
reconstructed image, achieved level, metrics table, and the chunk tree.

**Inspect tab:** chunk list with offsets/lengths/CRC status; FHDR field table; `BAND` edge
array; per-patch browser (jump by index, using `layout.patchOffset`) showing the
side-channel and a small heat-map of the body.

Accessibility & UX details: keyboard-reachable controls, `prefers-reduced-motion` disables
the carrier animation autoplay, all canvases have text alternatives describing the metric
they display, and every error toast is `role="alert"`.

---

## 9. Testing Strategy

One test corpus, two runners: `tests/index.html` (browser, ESM, reports into the DOM) and
`node --test tests/run-node.mjs` (CI). No test may depend on the DOM; anything needing
`ImageData` uses a 6-line shim.

### 9.1 Normative vectors (§16.3)

- **V1**, **V2** — exact, blocking, also asserted at app boot in dev mode.
- COLA verification failure: Hann @ `H = N/3` must throw `FDDP_E_COLA_VIOLATION`.
- Band-edge merging: §21's Profile A case must yield `J = 11` and the 12-entry array.
- Ragged vs resampled band **energy** equivalence to `1e-5` (§17.1).
- Phase wrap at `±π`: `princ()` boundary behaviour, and `PHI_COS/PHI_SIN` continuity.
- INT4 packing: known nibble pattern, LSB-first, low-nibble-first, per-patch zero pad.
- CDC segment boundaries: fixed input, fixed Gear table, exact cut offsets.
- Round-half-to-even at every exact `.5` point.
- Golden SHA-256 of the canonical `DATA` payload for each preset on a fixed xoshiro input.

### 9.2 Property tests

- `∀ x: idct2(dct2(x)) ≈ x` (1e-12), `‖dct2(x)‖ = ‖x‖`.
- `∀ image: ycocgR⁻¹(ycocgR(image)) === image` **exactly** (integer-reversible).
- `∀ container: read(write(c)) ≡ c`.
- `∀ i: patchOffset(i)` equals the scan-derived offset.
- Encoder determinism: two runs, byte-identical through S7.

### 9.3 Fuzzing / robustness (§18)

- Mutate random bytes of a valid container (1 000 trials): every run must terminate with a
  §19 code or a correct decode; no exception without a code, no OOM, no infinite loop, no
  allocation driven by an unvalidated header field.
- Decompression-bomb vector: `FHDR.token_count = 2^40` with a 1 KB `DATA`
  ⇒ `FDDP_E_COUNT_MISMATCH` **before** allocation.
- Ringing-amplification input (§18.2) with `NORM=NONE, QUANT=NONE`: assert the UI shows
  the "untrusted input" warning that §18.2 recommends.
- `MAX_SEGMENTS`, `MAX_CHUNK`, `MAX_N`, `MAX_EXPANSION` each have a dedicated vector.

### 9.4 Quality regression

A small fixed image set (synthetic gradients, a resolution chart, a photo, a screenshot of
text, pure noise) with committed metric baselines: PSNR, SSIM, rel-RMS, spectral
convergence, bits/octet per preset. A >2 % regression fails CI.

### 9.5 Carrier tests

- Synthetic degradation harness: render → apply perspective warp, blur (σ 0–3 px), JPEG
  (q 30–95), noise (σ 0–12), uneven illumination gradient, ±10 % rotation → decode.
  Report the success surface; require ≥95 % at the "typical phone photo" operating point.
- Fountain decoder: random frame drop rates 0–50 %, assert completion within 1.3× overhead.

---

## 10. Risk Register

| #  | Risk                                                                       | Likelihood | Impact | Mitigation                                                                                                                                   |
|----|----------------------------------------------------------------------------|------------|--------|----------------------------------------------------------------------------------------------------------------------------------------------|
| R1 | DCT scaling/offset convention wrong ⇒ everything downstream wrong          | med        | high   | V1/V2 as blocking boot-time assertions; naive reference kept forever                                                                         |
| R2 | `RESAMPLE_FIXED` cannot hit L2, user expects lossless                      | high       | med    | Settled in §2.3; encoder self-verifies and downgrades the declared level                                                                     |
| R3 | Log-domain int8 gives visible ringing                                      | high       | med    | `PATCH_Z` before quantisation; measured curve exposed in the UI; `faithful` preset available                                                 |
| R4 | Carrier optical decode is unreliable in the wild                           | med        | high   | Staged M7→M8; still-photo first; RS + fountain; version 8 default; honest capacity table                                                     |
| R5 | Main-thread jank on large photos                                           | high       | low    | Workers + transfers + default downscale + cancellation                                                                                       |
| R6 | Safari gaps (`OffscreenCanvas` in workers, `Float16Array`, `ImageCapture`) | med        | med    | Capability table at boot, per-feature fallbacks, no hard dependency on any of them                                                           |
| R7 | Cross-browser float divergence breaks byte-identity                        | low        | med    | §8.3 tolerates `1e-5` pre-quantisation; byte-identity is only claimed at S6/S7 where Δ dominates; golden hashes are per-preset and quantised |
| R8 | Scope creep into Profiles B/D/E                                            | med        | med    | Registry stubs throw `FDDP_E_PROFILE`; profiles are additive by §20, so later is fine                                                        |
| R9 | `crypto.subtle` unavailable on non-secure origins ⇒ no `source_digest`     | low        | low    | Require HTTPS/localhost; ship a pure-JS SHA-256 fallback for tests only, and flag the container's `STAT` as unverified                       |

---

## 11. Documentation Deliverables

- `docs/conformance.md` — a table of every **MUST** in §§1–15 with ✅/⛔/N-A and the file
  and test that discharges it. This is the artefact that makes the "conforming subset"
  claim checkable rather than rhetorical.
- `docs/deviations.md` — numbered deviations, e.g.:
    - **D-01** Profile C's 2-D↔1-D binding is not specified by v1.0; ours is declared in
      `XTRA/IMGD` (§2.2).
    - **D-02** Presets refuse to declare L2 under `RESAMPLE_FIXED` (§2.3); this is stricter
      than the spec, not looser.
    - **D-03** Radial rings realised as contiguous zig-zag runs via `EXPLICIT` edges (§2.4).
    - **D-04** Private channel `0x80 LINEAR_PEAK`; containers using it are marked
      non-interchange per §20.
- `docs/carrier.md` — the `FDDP-VC/1` carrier format, complete enough for an independent
  reader to be written against it.
- Inline: every module header cites the spec sections it implements.

---

## 12. Effort Summary

| Phase | Scope                           | Est.     |
|-------|---------------------------------|----------|
| M0    | foundations                     | 1 d      |
| M1    | transforms + V1/V2              | 2 d      |
| M2    | image encode path               | 3 d      |
| M3    | container I/O                   | 2 d      |
| M4    | decode + metrics                | 3 d      |
| M5    | camera capture                  | 1 d      |
| M6    | export + visualisation          | 1 d      |
| M7    | carrier render + still read     | 3 d      |
| M8    | carrier live camera read        | 3 d      |
|       | **core deliverable (M0–M6)**    | **13 d** |
|       | **with optical read (M0–M8)**   | **19 d** |
| M9    | CDC demo, L3/WHT, PROV, pyramid | open     |

---

## 13. Definition of Done (v1)

1. Load an image (file, paste, drag, or camera) → produce a `.fddp` container that a second
   independent run reproduces byte-for-byte.
2. Load that container → reconstruct the image, display it beside the original with the
   §17 metrics, and show the achieved reconstruction level — which the encoder verified
   rather than asserted.
3. Render the container as a visual carrier and read it back through the camera, with a
   full CRC-validated container at the end of the optical path.
4. `tests/index.html` and `node --test` both green, including V1, V2, and every golden
   hash in the manifest.
5. `docs/conformance.md` complete; every ⛔ maps to a specific §19 error code that the app
   actually raises.
6. No `Math.round`, no empty `catch`, no silent fallback, anywhere in the pipeline.
