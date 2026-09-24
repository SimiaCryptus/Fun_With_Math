# Frequency Domain Data Patches (FDDP)
## Specification v1.0 — Normative Draft

---

## 0. Status of This Document

This document specifies **Frequency Domain Data Patches (FDDP)**: a transport-neutral,
language-neutral method for converting arbitrary byte-addressable data into a grid of
spectral *patches* suitable for consumption by sequence models, retrieval indices, and
reconstruction pipelines.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**,
**SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** are to be interpreted as
described in RFC 2119.

An implementation that satisfies every **MUST** in §§1–15 for at least one conformance
class defined in §16 is a *conforming FDDP implementation*.

---

## 1. Purpose and Scope

### 1.1 Problem Statement

Patch-based tokenization — cutting a signal into contiguous fixed-size blocks and
projecting each block into an embedding — is the dominant interface between raw data and
sequence models. In the *spatial* (or *temporal*, or *byte-offset*) domain this interface
has three structural defects when applied to heterogeneous data:

1. **Alignment fragility.** Inserting a single byte near the head of a file shifts every
   downstream patch boundary. Representations computed over spatially aligned patches are
   therefore discontinuous under edits that a human would call trivial.
2. **Poor energy compaction.** Most real signals — audio, sensor traces, tabular columns,
   compiled binaries, demographic time series — concentrate their descriptive variance in
   a small number of spectral components. A spatial patch spends equal representational
   budget on every sample, which is a direct waste of context length.
3. **Scale entanglement.** A single patch size imposes a single analysis scale. Phenomena
   that live at other scales (a 40-year economic cycle inside an annual series; a 2 kHz
   formant inside a 48 kHz stream) are either aliased away or diluted across many patches.

### 1.2 Approach

FDDP replaces the spatial patch with a **band-limited, time-localized spectral tile**. The
source is projected into one or more numeric *lanes*, framed with overlapping windows,
transformed into a frequency representation, partitioned along the frequency axis into
perceptually or dyadically spaced *bands*, and grouped along the time axis into *patch
tiles*. Each tile is normalized, optionally quantized, and projected to a token vector.

The result is a token grid indexed by `(scale, lane, time-group, band)` rather than by
`(byte-offset)`.

### 1.3 In Scope

- The canonical processing pipeline and its normative parameterization (§4–§12).
- Profiles binding the pipeline to concrete data classes (§6).
- Reconstruction guarantees and the inverse pipeline (§13).
- Streaming and incremental semantics (§14).
- A byte-exact container format (§15).
- Conformance classes, test vectors, and validation metrics (§16–§17).

### 1.4 Out of Scope

- The architecture of any downstream model consuming FDDP tokens.
- Training procedures, loss functions, or learned codebook derivation (though §11.4
  specifies how externally derived codebooks are *referenced* and *transported*).
- Compression ratio guarantees. FDDP is a representation, not a codec, although
  Reconstruction Level L2 (§13.1) makes it usable as the analysis half of one.

---

## 2. Terminology and Notation

| Term | Definition |
|---|---|
| **Source object** | The addressable input: a file, a memory buffer, a stream segment, or a database extract. |
| **Canonical stream** | The source object after canonicalization (§4.1): a finite or unbounded sequence of octets. |
| **Lane** | A real-valued sequence `x_l[n]` derived from the canonical stream by a lane projection (§5). |
| **Frame** | A contiguous window of `N` samples from a lane, advanced by hop `H`. |
| **Spectrum** | The transform of one windowed frame; a vector of `K` coefficients. |
| **Bin** | A single coefficient index `k ∈ [0, K)`. |
| **Band** | A contiguous half-open bin range `[k_j, k_{j+1})`. |
| **Time group** | A run of `G` consecutive frames. |
| **Patch (tile)** | The tensor slice at one `(scale, lane, time-group, band)` coordinate. |
| **Channel** | A scalar feature computed per bin per frame (log-magnitude, phase-cosine, flux, …). |
| **Token** | The `D`-dimensional vector produced by projecting one patch. |
| **Scale** | One level of the multi-resolution pyramid (§10). |

Notation: `n` indexes samples, `k` indexes bins, `t` indexes frames, `j` indexes bands,
`l` indexes lanes, `s` indexes scales, `c` indexes channels. `⌊·⌋` is floor. All logs are
natural unless subscripted. Complex spectra are written `X[k] = A[k]·e^{iφ[k]}`.

---

## 3. Pipeline Overview

The normative pipeline is a strict sequence of nine stages. A conforming encoder **MUST**
behave *as if* the stages were executed in this order; fusion and reordering are permitted
only where bit-identical output is preserved.

    S0  Ingest & canonicalization          §4
    S1  Lane projection                    §5
    S2  Framing & windowing                §7
    S3  Transform                          §8
    S4  Spectral shaping (channels)        §9
    S5  Band partition & tiling            §10
    S6  Normalization                      §11.1–11.2
    S7  Quantization (optional)            §11.3–11.4
    S8  Positional & metadata encoding     §12
    S9  Serialization                      §15

Each stage is a pure function of its input and the *effective parameter set* (EPS) — the
fully resolved configuration recorded in the container header. Given an identical EPS and
identical canonical stream, two conforming encoders **MUST** produce byte-identical
output through S7. (S8–S9 admit implementation-defined padding only where §15 marks a
field `RESERVED`.)

---

## 4. Stage S0 — Ingest and Canonicalization

### 4.1 Canonical Stream

The encoder **MUST** reduce the source object to an octet sequence. For inputs that are
not natively octet sequences the following canonicalizations apply:

| Input class | Canonicalization |
|---|---|
| File on disk | Raw bytes; no transcoding, no normalization of line endings. |
| Text with declared encoding | Transcode to UTF-8, NFC-normalized; record original encoding in `XTRA`. |
| Numeric array | Serialize in little-endian, C-contiguous order at declared width. |
| Tabular extract | Column-major serialization, one lane per column (§6.4); nulls encoded per §4.3. |
| Live stream | Treated as unbounded; see §14. |

The encoder **MUST** record `source_length` (octets, or `0xFFFFFFFFFFFFFFFF` for unbounded)
and `source_digest` (SHA-256 of the canonical stream, or of each committed segment in
streaming mode) in the `STAT` chunk.

### 4.2 Content-Defined Anchoring (Shift Invariance)

To mitigate alignment fragility (§1.1), an encoder **MAY** anchor the frame grid to
content rather than to absolute offset. When `ANCHOR_MODE = CDC`:

- A 64-bit Gear rolling hash `g` is computed over a sliding window of `W_a = 48` octets.
- A *cut point* occurs at offset `p` when `g(p) & mask == 0`, with
  `mask = 2^b − 1`, `b = ANCHOR_BITS` (default 13, i.e. ~8 KiB expected spacing),
  subject to `MIN_SEG = 2^(b−2)` and `MAX_SEG = 2^(b+2)` octets.
- Frame index 0 of each segment begins at the cut point. Segments are processed
  independently; patches carry a `segment_id`.

When `ANCHOR_MODE = FIXED` (default) the grid begins at offset 0.

Encoders **MUST NOT** vary `ANCHOR_BITS` within a single container. The Gear table is
the one specified in Appendix A.1 and **MUST** be used verbatim; implementations that
substitute another table are non-conforming because segment boundaries — and therefore
the entire token grid — would differ.

### 4.3 Sentinel and Invalid Values

- Missing/null samples **MUST** be represented by a *mask lane* (§5.2), never by an
  in-band sentinel value.
- If a lane projection yields `NaN` or `±Inf`, the encoder **MUST** fail with
  `FDDP_E_NONFINITE` unless `NONFINITE_POLICY = CLAMP`, in which case values are clamped
  to `±FLT_MAX` and the incident is counted in `STAT.nonfinite_count`.
- Denormal inputs **SHOULD** be flushed to zero prior to S2 to guarantee cross-platform
  bit-identity.

---

## 5. Stage S1 — Lane Projection

### 5.1 Lane Kinds

A lane projection maps the canonical stream to `L` real sequences. The registry of lane
kinds is:

| ID | Name | Definition | Typical use |
|---|---|---|---|
| `0x01` | `U8_CENTERED` | `x[n] = (b[n] − 127.5) / 127.5` | Generic bytes |
| `0x02` | `U8_BITPLANE` | 8 lanes; `x_m[n] = 2·bit_m(b[n]) − 1` | Binaries, bitfields |
| `0x03` | `I16LE` / `0x04` `I16BE` | Reinterpret pairs; scale by `1/32768` | PCM audio |
| `0x05` | `F32LE` | Reinterpret quads; pass through | Sensor, scientific |
| `0x06` | `DELTA` | First difference of a parent lane | Trend removal |
| `0x07` | `NGRAM_HASH` | `x_h[n] = 1` iff `H(b[n−q+1..n]) mod L_h == h` | Text, code |
| `0x08` | `ENTROPY` | Shannon entropy of a sliding `W_e`-octet window, scaled to `[−1,1]` | Packed/encrypted regions |
| `0x09` | `MASK` | Validity indicator, `{0,1}` | Missing data |
| `0x0A` | `EXOGENOUS` | Externally supplied numeric series aligned to the stream clock | Profile E (§6.5) |

Encoders **MUST** emit a `LANE` chunk entry per lane recording its ID, its parent lane
index (or `0xFFFF` for root), and any kind-specific parameters (`q`, `L_h`, `W_e`).

### 5.2 Mask Semantics

If any `MASK` lane is present, all transforms of sibling lanes **MUST** be computed on
mask-zeroed data, and the per-frame *validity fraction*
`v[t] = (1/N)·Σ_n w[n]·m[n+tH] / (1/N)·Σ_n w[n]`
**MUST** be recorded as channel `c_valid` (§9.1). Patches with `v < VALID_MIN`
(default 0.25) **MUST** be flagged `PATCH_FLAG_SPARSE` and **SHOULD** be excluded from
normalization statistics.

### 5.3 Lane Budget

`L ≤ 64` for Conformance Class Core; `L ≤ 512` for Full. Encoders **MUST** reject
configurations exceeding the class limit with `FDDP_E_LANE_BUDGET`.

---

## 6. Profiles

A *profile* is a named, versioned binding of the whole parameter space. Profiles exist so
that two independent implementations can interoperate without negotiating forty scalars.
An encoder **MUST** declare exactly one profile ID in the header and **MAY** override
individual parameters, recording each override explicitly.

### 6.1 Profile A — `GENERIC_BYTE` (mandatory for all implementations)

    lanes            : U8_CENTERED (1) + ENTROPY (1)
    N                : 1024
    H                : 512
    window           : periodic Hann
    transform        : DCT-II, orthonormal
    K                : 1024
    bands            : 16, dyadic-log (Appendix A.2)
    G                : 4
    channels         : {log-mag, Δt log-mag}
    normalization    : per-band running z-score, EMA half-life 64 patches
    quantization     : int8 affine, per-patch scale
    anchor           : CDC, ANCHOR_BITS = 13
    reconstruction   : L0
    D                : 768

### 6.2 Profile B — `AUDIO_PCM`

    lanes            : I16LE per channel
    N                : 2048 @ 48 kHz (scale 0)
    H                : 512 (75 % overlap)
    window           : √Hann (WOLA, COLA-satisfying at H = N/4)
    transform        : rFFT
    bands            : 64, mel-spaced, 20 Hz – 20 kHz
    channels         : {log-mag, φcos, φsin, ∂φ/∂t}
    G                : 8
    reconstruction   : L2
    scales           : 3 (N = 512, 2048, 8192)

### 6.3 Profile C — `IMAGE_2D`

    lanes            : per colour plane after RGB→YCoCg-R
    transform        : separable 2-D DCT-II on 16×16 blocks
    bands            : 10, zig-zag radial rings
    G                : 2×2 blocks
    channels         : {signed log-mag}
    anchor           : FIXED (raster order)
    reconstruction   : L2

### 6.4 Profile D — `TABULAR_SERIES`

    lanes            : one per numeric column + MASK per nullable column
    pre-transform    : per-column robust scaling (median / IQR)
    N                : 256 rows, H = 64
    transform        : DWT, Daubechies-4, 5 levels
    bands            : one per wavelet level + approximation
    channels         : {log-mag, sign}
    reconstruction   : L2

### 6.5 Profile E — `RELATIONAL_EVENT`

Defined for longitudinal socioeconomic and relational-event corpora, where the input is a
set of group-level attribute series and pairwise interaction intensities sampled on a
common calendar clock.

    lanes            : EXOGENOUS per (group, attribute) and per (dyad, relation-type)
    pre-transform    : log1p on count-valued lanes; detrend by 1st-order difference
    N                : 128 time steps (e.g. annual), H = 16
    window           : Tukey, α = 0.25  (low edge leakage, near-flat interior)
    transform        : rFFT
    bands            : 6, log-spaced over period 2–128 steps
                        (short cycle / business cycle / generational / secular)
    channels         : {log-mag, φcos, φsin, cross-lane coherence (§9.4)}
    G                : 1
    reconstruction   : L1

Profile E exists because periodicity, phase lead/lag, and band-limited coherence between
group series are precisely the quantities that narrative macro-history argues about
informally. Encoding them as first-class patch channels makes them addressable by a
model rather than inferable from raw levels.

---

## 7. Stage S2 — Framing and Windowing

### 7.1 Frame Geometry

- `N` **MUST** be a power of two in `[64, 65536]` for FFT/DCT transforms; for DWT it
  **MUST** be a multiple of `2^levels`.
- `H` **MUST** satisfy `1 ≤ H ≤ N`. Overlap ratio `ρ = 1 − H/N`.
- Frame count for a finite lane of length `M`:
  `T = 1 + ⌊(M_pad − N) / H⌋`, where `M_pad` is defined by the padding policy.

### 7.2 Padding Policy

| Value | Behaviour |
|---|---|
| `PAD_ZERO` | Append zeros to reach the next whole frame. Default. |
| `PAD_REFLECT` | Mirror about the terminal sample, excluding it. |
| `PAD_WRAP` | Circular. **MUST NOT** be used with `ANCHOR_MODE = CDC`. |
| `PAD_DROP` | Discard the trailing partial frame. |

Head padding of `N/2` samples (centred framing) is **OPTIONAL** and **MUST** be signalled
by `CENTERED = 1`; it changes the time index of every patch and is therefore part of the
EPS.

### 7.3 Windows

Supported window IDs and definitions (`n ∈ [0, N)`, periodic form):

| ID | Name | `w[n]` |
|---|---|---|
| `0x00` | Rectangular | `1` |
| `0x01` | Hann | `0.5(1 − cos(2πn/N))` |
| `0x02` | Hamming | `0.54 − 0.46·cos(2πn/N)` |
| `0x03` | √Hann | `sqrt(0.5(1 − cos(2πn/N)))` |
| `0x04` | Blackman-Harris (4-term) | `Σ_{i=0}^{3} (−1)^i a_i cos(2πin/N)`, `a = (0.35875, 0.48829, 0.14128, 0.01168)` |
| `0x05` | Tukey(α) | Cosine-tapered rectangle, taper width `αN/2` each side |
| `0x06` | KBD(α) | Kaiser–Bessel-derived, for MDCT |

### 7.4 COLA / WOLA Constraint

If `reconstruction_level ≥ L2`, the `(window, H)` pair **MUST** satisfy the
Constant-Overlap-Add condition to within `1e−7`:

    Σ_t w[n + tH]^p = const  for all n,   p = 1 (OLA) or p = 2 (WOLA)

Encoders **MUST** verify this numerically at configuration time and fail with
`FDDP_E_COLA_VIOLATION` otherwise. Canonical safe pairs: Hann @ `H = N/2`;
√Hann @ `H = N/4`; KBD @ `H = N/2` with MDCT.

---

## 8. Stage S3 — Transform

### 8.1 Registry

| ID | Transform | Output `K` | Complex |
|---|---|---|---|
| `0x01` | DCT-II (orthonormal) | `N` | no |
| `0x02` | rFFT | `N/2 + 1` | yes |
| `0x03` | MDCT | `N/2` | no |
| `0x04` | DWT (Daubechies-`2p`) | `N` | no |
| `0x05` | WHT (Walsh–Hadamard, sequency-ordered) | `N` | no |
| `0x06` | Mel-filtered rFFT | `n_mels` | no |
| `0x07` | CQT (constant-Q, `B` bins/octave) | implementation-defined, recorded | yes |
| `0x08` | 2-D separable DCT-II | `N_r × N_c` | no |

### 8.2 Normative Definitions

**DCT-II, orthonormal:**

    X[k] = α(k) · Σ_{n=0}^{N−1} x[n]·w[n]·cos( (π/N)·(n + ½)·k )
    α(0) = sqrt(1/N),   α(k>0) = sqrt(2/N)

**rFFT:**

    X[k] = Σ_{n=0}^{N−1} x[n]·w[n]·e^{−i·2πkn/N},   k ∈ [0, N/2]

Scaling is *unnormalized forward*; the inverse carries the `1/N`. Encoders **MUST** record
`XFRM.scaling = 0x00 (forward-unnormalized)` or `0x01 (orthonormal)`.

**MDCT:**

    X[k] = Σ_{n=0}^{2N'−1} x[n]·w[n]·cos( (π/N')·(n + ½ + N'/2)·(k + ½) ),  N' = N/2

**DWT:** Mallat cascade with periodic extension; coefficient layout is
`[cA_J | cD_J | cD_{J−1} | … | cD_1]`.

### 8.3 Numerical Requirements

- Intermediate accumulation **MUST** use at least binary32; binary64 is **RECOMMENDED**
  for `N ≥ 8192`.
- Relative error of the implemented transform against a binary64 reference
  **MUST NOT** exceed `1e−5` in RMS over the conformance test vectors (§16.3).
- Fused multiply-add reassociation is permitted; the `1e−5` tolerance absorbs it.
  Bit-identity is **NOT** required at S3, only at S6/S7 after quantization, where the
  quantization step size dominates the transform error by at least two orders of
  magnitude (this is the normative justification for the tolerance).

---

## 9. Stage S4 — Spectral Shaping (Channel Construction)

Each `(t, k)` cell is expanded into `C` channels. Channel IDs:

### 9.1 Channel Registry

| ID | Name | Formula |
|---|---|---|
| `0x01` | `LOGMAG` | `ln(A[t,k] + δ) − ln δ`, `δ = 1e−6` |
| `0x02` | `SIGNED_LOGMAG` | `sgn(X)·(ln(|X| + δ) − ln δ)` (real transforms) |
| `0x03` | `PHI_COS` | `cos φ[t,k]` |
| `0x04` | `PHI_SIN` | `sin φ[t,k]` |
| `0x05` | `IF` (instantaneous frequency) | `princ(φ[t,k] − φ[t−1,k] − 2πkH/N) / π` |
| `0x06` | `GD` (group delay) | `princ(φ[t,k] − φ[t,k−1]) / π` |
| `0x07` | `FLUX_T` | `LOGMAG[t,k] − LOGMAG[t−1,k]` |
| `0x08` | `FLUX_K` | `LOGMAG[t,k] − LOGMAG[t,k−1]` |
| `0x09` | `VALID` | Frame validity fraction `v[t]` (§5.2), broadcast over `k` |
| `0x0A` | `COHERE` | Cross-lane magnitude-squared coherence (§9.4) |

`princ(θ)` wraps to `(−π, π]`. Channels `IF`, `FLUX_T` at `t = 0` and `GD`, `FLUX_K` at
`k = 0` **MUST** be set to `0`.

### 9.2 Why Log-Magnitude Is Mandatory

Raw magnitudes of natural data span 6–10 decades. Any fixed-point or bounded-activation
consumer will saturate. The `ln(A + δ) − ln δ` form is chosen over `log(A)` because it is
finite at `A = 0`, monotone, and has bounded derivative near zero, which keeps the
Jacobian of the whole pipeline bounded — a prerequisite for gradient-based training of
any downstream projector and for the stability bound in §17.2.

### 9.3 Phase Handling Policy

| Policy | Channels retained | Reconstruction |
|---|---|---|
| `PHASE_DISCARD` | `LOGMAG` only | L0 or L1 |
| `PHASE_CARTESIAN` | `PHI_COS`, `PHI_SIN` | L2 |
| `PHASE_DERIVATIVE` | `IF`, `GD` | L1+ (phase integrated at decode) |
| `PHASE_COMPLEX` | Real and imaginary parts directly, no polar decomposition | L2, bit-exact |

`PHASE_CARTESIAN` is **RECOMMENDED** over storing `φ` directly: `φ` is discontinuous at
`±π`, which makes it hostile to both quantization and smooth projection, whereas
`(cos φ, sin φ)` is continuous on the circle at the cost of one extra channel.

### 9.4 Cross-Lane Coherence (Profile E)

For a declared lane pair `(l, l′)` and band `j`, over a time group of `G` frames:

    S_ll′[j] = Σ_{t∈G} Σ_{k∈band j} X_l[t,k] · conj(X_l′[t,k])
    C_ll′[j] = |S_ll′[j]|² / ( S_ll[j] · S_l′l′[j] + δ )

`COHERE` **MUST** be emitted as a patch-level scalar (not per-bin) and stored in the patch
side-channel (§11.2). The pair list is declared in the `XTRA` chunk; a maximum of 64 pairs
is permitted per container.

---

## 10. Stage S5 — Band Partition and Tiling

### 10.1 Band Edge Schemes

| ID | Scheme | Edge rule |
|---|---|---|
| `0x01` | `LINEAR` | `k_j = ⌊j·K/J⌋` |
| `0x02` | `DYADIC` | `k_0 = 0, k_1 = 1, k_j = 2^{j−1}` clipped to `K` |
| `0x03` | `LOG` | `k_j = ⌊k_min·(k_max/k_min)^{j/J}⌋`, deduplicated |
| `0x04` | `MEL` | Slaney mel scale, `m = 2595·log10(1 + f/700)` |
| `0x05` | `ERB` | `ERB(f) = 24.7(4.37f/1000 + 1)` |
| `0x06` | `RADIAL` | 2-D only; rings of constant `sqrt(k_r² + k_c²)` |
| `0x07` | `EXPLICIT` | Edge array transported verbatim in `BAND` |

Bands **MUST** be non-empty, contiguous, non-overlapping, and cover `[k_min, k_max)`
exactly. Degenerate bands arising from rounding **MUST** be merged with their successor,
and the merged edge array — not the generating rule — **MUST** be what the `BAND` chunk
carries. This removes any dependence on the encoder's rounding mode.

### 10.2 Patch Geometry

A patch at coordinate `(s, l, g, j)` covers frames `[gG, (g+1)G)` and bins
`[k_j, k_{j+1})`. Its dense form is a tensor of shape:

    G × (k_{j+1} − k_j) × C

Because band widths differ, patches are *ragged*. Two resolution policies are defined:

| Policy | Behaviour |
|---|---|
| `RESAMPLE_FIXED` | Each band is resampled along `k` to a fixed `K_p` (default 16) by area-averaging in the linear-magnitude domain *before* log compression. Yields a rectangular token grid. **Default.** |
| `RAGGED` | Native widths retained; the projector **MUST** be band-indexed (one weight matrix per band). |

`RESAMPLE_FIXED` **MUST** perform the area-average on linear magnitudes, not on
log-magnitudes, so that band energy is preserved exactly; averaging logs would compute a
geometric mean and silently bias every wide band downward.

### 10.3 Multi-Resolution Pyramid

For `S` scales, scale `s` uses `N_s = N_0·2^s` and `H_s = H_0·2^s`, preserving overlap
ratio. Patches from all scales enter the same token sequence, distinguished by the scale
axis of the positional encoding (§12). The total token count is bounded by:

    T_total ≤ Σ_{s=0}^{S−1} L · ⌈T_s/G⌉ · J_s

Encoders **MUST** compute `T_total` before emitting data and fail with
`FDDP_E_TOKEN_BUDGET` if it exceeds `MAX_TOKENS` (§19.1).

### 10.4 Emission Order

Patches **MUST** be emitted in the canonical order:

    for segment ascending
      for scale ascending
        for time-group ascending
          for lane ascending
            for band ascending

This order is normative because it is what `source_digest` and the golden hashes in §16.3
are computed over.

---

## 11. Stage S6/S7 — Normalization and Quantization

### 11.1 Normalization Modes

| ID | Mode | Definition |
|---|---|---|
| `0x01` | `GLOBAL_Z` | `(x − μ_{l,j,c}) / σ_{l,j,c}` using statistics in the `NORM` chunk |
| `0x02` | `RUNNING_Z` | EMA statistics with half-life `λ` patches; causal, streaming-safe |
| `0x03` | `PATCH_Z` | Per-patch mean/variance; mean and log-σ emitted as side-channel |
| `0x04` | `PEAK` | Divide by per-patch max-abs; scale emitted as side-channel |
| `0x05` | `NONE` | Identity |

`RUNNING_Z` with `λ = 64` is the default for streaming. Its update is:

    μ ← μ + (1 − 2^{−1/λ})·(x̄ − μ)
    σ² ← σ² + (1 − 2^{−1/λ})·((x̄ − μ)² − σ²)

and **MUST** be applied *after* the patch is encoded, never before, so that decode is
causal and reproducible.

### 11.2 Side-Channel

Every patch carries a fixed 8-byte side-channel: `{ mean: f16, log_scale: f16,
valid_frac: u8, flags: u8, cohere: f16 }`. Discarding normalization statistics is a
common and serious error: it makes patches scale-blind, so that a whisper and a shout, or
a village and a nation, produce identical tokens. The side-channel **MUST** be projected
into the token alongside the patch body (§12.3).

### 11.3 Quantization Schemes

| ID | Scheme | Payload |
|---|---|---|
| `0x00` | `NONE` | f32 or f16 as declared |
| `0x01` | `AFFINE_INT8` | `q = clamp(round(x/Δ) + z, −128, 127)`, per-patch `Δ`, `z` |
| `0x02` | `AFFINE_INT4` | As above, packed two per octet, low nibble first |
| `0x03` | `MU_LAW8` | `μ = 255`, applied to peak-normalized values |
| `0x04` | `VQ` | Codebook index into a referenced codebook (§11.4) |
| `0x05` | `RVQ` | `R` residual stages, indices concatenated |

Rounding **MUST** be round-half-to-even. This is the single largest source of
cross-implementation divergence and is therefore normative rather than advisory.

### 11.4 Codebook Transport

Codebooks are *referenced*, not embedded, by a 32-byte identifier: the SHA-256 of the
codebook's canonical serialization (`u32 num_entries`, `u32 dim`, `f32[]` row-major,
little-endian). A decoder that cannot resolve the identifier **MUST** fail with
`FDDP_E_CODEBOOK_MISSING` rather than substituting a default; a silently substituted
codebook produces plausible-looking but semantically wrong output, which is worse than an
error.

Containers **MAY** embed the codebook in an `XTRA` chunk of subtype `CBOK`.

---

## 12. Stage S8 — Positional and Metadata Encoding

### 12.1 Coordinate Axes

Every patch carries a four-component coordinate:

    (scale s, lane l, time-group g, band j)

plus `segment_id` when `ANCHOR_MODE = CDC`.

### 12.2 Axial Rotary Encoding (Normative Default)

The token dimension `D` is partitioned into four contiguous groups of size `D/4`
(`D` **MUST** be divisible by 8). Within group `a ∈ {scale, lane, time, band}`, rotary
pairs `(d, d+1)` are rotated by angle `θ_{a,d} = p_a · ω_{a,d}`, with

    ω_{a,d} = base_a^{ −2d / (D/4) }

| Axis | `base_a` | Position `p_a` |
|---|---|---|
| scale | 100 | `s` |
| lane | 1000 | `l` |
| time | 10000 | `g` (absolute group index within segment) |
| band | 1000 | `j` |

The time axis **MUST** use absolute group index, not a per-window relative index; models
that require relative behaviour obtain it from the rotary difference property.

### 12.3 Token Assembly

    body      = flatten( patch tensor )            ∈ R^{G·K_p·C}
    side      = side-channel decoded to 5 floats
    token     = W_body · body + W_side · side + b   ∈ R^D
    token     = RoPE_axial( token, coordinate )

`W_body`, `W_side`, `b` are **NOT** specified by this document; they are the consumer's
parameters. What is specified is (a) the flattening order — `G`-major, then `K_p`, then
`C` — and (b) that the side-channel participates additively before rotation. Both are
required for interchange of pretrained projectors.

---

## 13. Reconstruction

### 13.1 Reconstruction Levels

| Level | Guarantee |
|---|---|
| **L0** | None. Analysis-only. Decoder **MAY** refuse reconstruction. |
| **L1** | Magnitude-faithful. Phase estimated (Griffin–Lim, `≥ 60` iterations, momentum 0.99). Spectral convergence `≤ −12 dB` on conformance vectors. |
| **L2** | Waveform-faithful within `ε`. Relative RMS error `≤ 1e−4` for f16 payloads, `≤ 1e−6` for f32 payloads, measured over the canonical stream excluding padding. |
| **L3** | Bit-exact. Requires `QUANT = NONE`, `PHASE_COMPLEX`, `NORM = NONE`, `RESOLUTION = RAGGED`, and an integer-exact transform (`WHT` or lifting-based DWT). |

### 13.2 Inverse Pipeline

Inverse stages execute in reverse order with the following normative details:

1. **Dequantize** using the transported `Δ`, `z`, codebook.
2. **Denormalize** using the side-channel and `NORM` statistics. For `RUNNING_Z`, the
   decoder **MUST** replay the same causal EMA update schedule.
3. **Un-tile.** For `RESAMPLE_FIXED`, expand each band by nearest-neighbour in `k` and
   rescale so band energy matches the decoded band energy exactly.
4. **Recompose spectrum.** `A = exp(LOGMAG + ln δ) − δ`; `X = A·(PHI_COS + i·PHI_SIN)`
   renormalized so that `|PHI_COS + i·PHI_SIN| = 1`.
5. **Inverse transform** per §8.2 with the declared scaling.
6. **Overlap-add** with synthesis window `w_s = w` (WOLA) or `w_s = 1` (OLA), divided by
   the COLA normalizer computed at configuration time.
7. **Un-project lanes**, invert any `DELTA` by prefix sum, and re-serialize.

### 13.3 Non-Invertible Lanes

`ENTROPY`, `NGRAM_HASH`, and `COHERE` are analysis-only. A container whose lane set
contains only non-invertible lanes **MUST** declare L0 and **MUST** set
`HDR_FLAG_NO_RECONSTRUCT`.

---

## 14. Streaming and Incremental Operation

### 14.1 Commit Semantics

A patch is *committed* when all `G` frames of its time group and all channel dependencies
are available. Dependencies:

- `FLUX_T` and `IF` require frame `t−1` — satisfied within the group except at `t = gG`,
  where the previous group's terminal frame **MUST** be retained.
- `COHERE` requires all participating lanes for the whole group.

### 14.2 Latency

For non-centred framing, algorithmic latency in samples is:

    latency = N + (G − 1)·H

Centred framing adds `N/2`. Implementations **MUST** report latency through the capability
interface (§15.4) so that callers can reason about it rather than measure it.

### 14.3 Causal Mode

When `CAUSAL = 1`:
- `GD` and `FLUX_K` remain available (they are intra-frame).
- Normalization **MUST** be `RUNNING_Z`, `PATCH_Z`, `PEAK`, or `NONE`.
- `PAD_REFLECT` and `PAD_WRAP` **MUST NOT** be used.
- Asymmetric analysis windows are permitted; the synthesis window **MUST** then be
  transported explicitly in an `XTRA/WNDW` chunk.

### 14.4 Backpressure and Segment Flush

In `CDC` anchoring, a segment is flushed when a cut point is found or `MAX_SEG` is
reached. On end-of-stream the final partial segment is flushed with the declared padding
policy and flagged `SEG_FLAG_TRUNCATED`.

---

## 15. Container Format

### 15.1 Overview

FDDP containers are chunked, little-endian, and CRC-protected. The layout is:

    Signature (8 bytes) | Header chunk | Descriptor chunks | DATA chunks | STAT | IEND

### 15.2 Signature

    offset 0: 46 44 44 50 0D 0A 1A 0A    ("FDDP", CR, LF, SUB, LF)

The CR/LF/SUB/LF guard detects text-mode corruption, truncation, and 7-bit stripping.

### 15.3 Chunk Structure

| Field | Type | Notes |
|---|---|---|
| `length` | `u32` | Payload bytes, excluding type and CRC. `≤ 2^31 − 1`. |
| `type` | `u8[4]` | ASCII. Bit 5 of byte 0 clear ⇒ critical. |
| `payload` | `u8[length]` | |
| `crc` | `u32` | CRC-32C (Castagnoli) over `type ‖ payload`. |

Decoders **MUST** reject a container containing an unrecognized *critical* chunk with
`FDDP_E_UNKNOWN_CRITICAL`, and **MUST** skip unrecognized *ancillary* chunks.

### 15.4 Chunk Registry

| Type | Crit. | Cardinality | Contents |
|---|---|---|---|
| `FHDR` | yes | 1, first | Version, profile, flags, `D`, `S`, `L`, `G`, `K_p`, token count, latency. |
| `LANE` | yes | 1 | `L` entries: kind ID, parent, parameter blob. |
| `XFRM` | yes | 1 | Per-scale: `N`, `H`, window ID + params, transform ID, scaling, `K`. |
| `BAND` | yes | 1 | Per-scale: scheme ID, `J`, explicit edge array (`u32[J+1]`). |
| `CHAN` | yes | 1 | Ordered channel ID list; `C` implied. |
| `NORM` | yes | 1 | Mode ID, `λ`, statistics table `f32[L][J][C][2]` if `GLOBAL_Z`. |
| `QUAN` | yes | 1 | Scheme ID, payload width, codebook digest. |
| `POSI` | no | 0–1 | Positional scheme ID and bases (defaults per §12.2 if absent). |
| `SEGS` | yes¹ | 0–1 | Segment table: offset, length, flags. ¹Critical iff `CDC`. |
| `DATA` | yes | ≥1 | Patch payload in canonical order (§10.4). Splittable. |
| `STAT` | no | 0–1 | `source_length`, `source_digest`, counters, encoder identifier. |
| `XTRA` | no | ≥0 | Subtyped extension: `CBOK`, `WNDW`, `PAIR`, `PROV`. |
| `IEND` | yes | 1, last | Empty. |

### 15.5 `FHDR` Payload

| Offset | Type | Field |
|---|---|---|
| 0 | `u16` | `version_major` (1) |
| 2 | `u16` | `version_minor` (0) |
| 4 | `u16` | `profile_id` |
| 6 | `u16` | `flags` (see below) |
| 8 | `u16` | `D` |
| 10 | `u8` | `S` (scales) |
| 11 | `u8` | `C` (channels) |
| 12 | `u16` | `L` (lanes) |
| 14 | `u16` | `G` (frames per group) |
| 16 | `u16` | `K_p` (resampled band width; 0 ⇒ ragged) |
| 18 | `u8` | `anchor_mode` |
| 19 | `u8` | `anchor_bits` |
| 20 | `u8` | `reconstruction_level` |
| 21 | `u8` | `pad_policy` |
| 22 | `u64` | `token_count` |
| 30 | `u32` | `latency_samples` |
| 34 | `u8[6]` | RESERVED, **MUST** be zero |

Flags: bit 0 `CENTERED`, bit 1 `CAUSAL`, bit 2 `NO_RECONSTRUCT`, bit 3 `HAS_MASK`,
bit 4 `QUANT_PRESENT`, bits 5–15 RESERVED.

### 15.6 `DATA` Payload

Patches are packed back-to-back with no inter-patch padding. Each patch is:

    side_channel (8 bytes) ‖ body (ceil(G · K_p · C · bits_per_value / 8) bytes)

Bit-packed payloads (`INT4`, `VQ` with non-octet index width) are packed LSB-first within
each octet and **MUST** be zero-padded to an octet boundary at the end of each patch.
Per-patch padding, rather than per-`DATA`-chunk padding, is required so that a patch is
randomly addressable by index arithmetic alone.

---

## 16. Conformance

### 16.1 Classes

| Class | Requirements |
|---|---|
| **Core** | Profile A. Transforms `0x01`, `0x02`. `L ≤ 64`, `S = 1`. Levels L0, L1. Container read/write. |
| **Extended** | Core + Profiles B, D. Transforms `0x01`–`0x05`. `S ≤ 4`. Level L2. Streaming (§14). |
| **Full** | Extended + Profiles C, E. All transforms. `L ≤ 512`. Levels L0–L3. VQ/RVQ. CDC anchoring. |

### 16.2 Encoder/Decoder Asymmetry

A decoder **MUST** support every parameter combination its declared class permits, even
those its paired encoder never emits. Encoders **MAY** emit a subset. This asymmetry is
deliberate: the ecosystem tolerates conservative producers, not permissive consumers.

### 16.3 Test Vectors

The conformance bundle defines, for each class, a set of `(input, EPS, expected)` triples.
Inputs are generated deterministically from a `xoshiro256**` generator with the seeds
listed in the bundle manifest; no external data is required.

Two analytic vectors are normative and **MUST** be reproduced exactly (to within the §8.3
tolerance) by every implementation:

**V1 — DC response.** `N = 8`, rectangular window, orthonormal DCT-II, `x[n] = 1`:

    X = [ 2.82842712, 0, 0, 0, 0, 0, 0, 0 ]

(`X[0] = sqrt(1/8)·8 = 2√2`.) Any implementation returning `8`, `1`, or `2` has an
incorrect scaling convention.

**V2 — Single-tone isolation.** `N = 8`, rectangular window, orthonormal DCT-II,
`x[n] = cos( (π/8)·(n + ½)·2 )`:

    X = [ 0, 0, 2.0, 0, 0, 0, 0, 0 ]

(`X[2] = sqrt(2/8)·Σ cos² = 0.5 · 4 = 2.0`.) V2 additionally verifies the half-sample
offset in the DCT-II kernel, which is the most frequently mis-implemented detail in the
entire transform stage.

Remaining vectors exercise: COLA verification failure, band-edge merging, ragged vs.
resampled equivalence of band energy, phase wrap at `±π`, `INT4` bit packing, CDC segment
boundaries, and round-half-to-even at exact `.5` quantization points. Golden SHA-256
digests of the canonical `DATA` payload accompany each vector in the bundle manifest.

---

## 17. Quality Metrics and Validation

### 17.1 Energy Preservation

For orthonormal transforms and `RESAMPLE_FIXED`, band-summed energy **MUST** satisfy

    | Σ_j E_j − Σ_n (x[n]·w[n])² |  /  Σ_n (x[n]·w[n])²   ≤ 1e−5

This is the primary regression test for §10.2; failures almost always indicate averaging
in the log domain.

### 17.2 Lipschitz Bound

The composed map from canonical stream to unquantized patch tensor is Lipschitz with
constant bounded by

    Λ ≤ ‖w‖_∞ · ‖F‖_2 · (1/δ)

where `‖F‖_2 = 1` for orthonormal transforms and `sqrt(N)` for unnormalized rFFT.
Implementations **SHOULD** assert `Λ` at configuration time; an unbounded `Λ` (e.g. from
`δ = 0`) makes downstream training numerically unsafe.

### 17.3 Shift-Invariance Score

Defined as the mean Jaccard similarity between quantized token multisets of a stream and
the same stream with `r` random single-octet insertions, `r ∈ {1, 4, 16}`.

| Anchor mode | Expected score at `r = 1` |
|---|---|
| `FIXED` | `≈ 0.05` (near-total desynchronization) |
| `CDC` | `≥ 0.90` |

Implementations claiming CDC support **MUST** meet the `0.90` threshold on the
conformance corpus. This metric is the empirical justification for §4.2 existing at all.

### 17.4 Reconstruction Metrics

- **L1:** spectral convergence `‖|STFT(x̂)| − |STFT(x)|‖_F / ‖|STFT(x)|‖_F ≤ 0.25`.
- **L2:** relative RMS error per §13.1.
- **L3:** byte equality of the canonical stream.

### 17.5 Representational Budget

Report `bits_per_source_octet = (8 · DATA_bytes) / source_length`. Profiles **SHOULD**
document a target; Profile A targets `≤ 2.0` at `INT8`, `G = 4`, `J = 16`, `K_p = 16`,
`C = 2`, `H = N/2`.

---

## 18. Security and Robustness

### 18.1 Resource Limits

| Limit | Default | Enforced at |
|---|---|---|
| `MAX_TOKENS` | `2^24` | §10.3, before allocation |
| `MAX_EXPANSION` | `64×` source octets | Container write and read |
| `MAX_CHUNK` | `2^31 − 1` | Chunk parse |
| `MAX_LANES` | class-dependent | §5.3 |
| `MAX_SEGMENTS` | `2^20` | `SEGS` parse |
| `MAX_N` | `65536` | §7.1 |

Decoders **MUST** validate every length field against the remaining container bytes
*before* allocating, and **MUST** treat `token_count` in `FHDR` as advisory — reconciling
it against actual `DATA` length and failing with `FDDP_E_COUNT_MISMATCH` on divergence.
A header-driven allocation is the classic decompression-bomb vector and is prohibited.

### 18.2 Adversarial Inputs

- **Ringing amplification.** Crafted inputs can maximize Gibbs ringing at band edges,
  producing extreme log-magnitudes. The `δ`-offset log (§9.2) plus per-patch
  normalization bounds this; `NORM = NONE` with `QUANT = NONE` does not, and **SHOULD
  NOT** be combined with untrusted input.
- **Non-finite injection.** Covered by §4.3. Decoders **MUST** additionally check
  dequantized values for finiteness before inverse transform.
- **CDC boundary manipulation.** An adversary controlling content can force `MIN_SEG`
  segments throughout, inflating segment count. `MAX_SEGMENTS` plus the `MIN_SEG` floor
  bound the damage; encoders **SHOULD** additionally abort if mean segment length falls
  below `MIN_SEG · 1.25`.

### 18.3 Side Channels

Encoding time **MUST NOT** depend on payload values in a way that reveals them when
processing secret material: transforms are data-oblivious by construction, but
denormal-induced slowdowns are not. §4.3's flush-to-zero requirement is therefore also a
security requirement.

### 18.4 Provenance

The `XTRA/PROV` chunk **MAY** carry a detached signature over
`signature_input = FHDR ‖ LANE ‖ XFRM ‖ BAND ‖ CHAN ‖ NORM ‖ QUAN ‖ all DATA payloads`
in emission order. Verification failure **MUST** be surfaced; it **MUST NOT** silently
downgrade to unverified.

---

## 19. Error Codes

| Code | Condition |
|---|---|
| `FDDP_E_SIGNATURE` | Bad magic or guard bytes. |
| `FDDP_E_VERSION` | `version_major` unsupported. |
| `FDDP_E_UNKNOWN_CRITICAL` | Unrecognized critical chunk type. |
| `FDDP_E_CRC` | Chunk CRC-32C mismatch. |
| `FDDP_E_PROFILE` | Unknown or unsupported profile ID. |
| `FDDP_E_PARAM` | Parameter outside normative range. |
| `FDDP_E_COLA_VIOLATION` | `(window, H)` fails §7.4 at declared level. |
| `FDDP_E_BAND_DEGENERATE` | Band edges non-monotone or non-covering. |
| `FDDP_E_LANE_BUDGET` | `L` exceeds class limit. |
| `FDDP_E_TOKEN_BUDGET` | Projected token count exceeds `MAX_TOKENS`. |
| `FDDP_E_NONFINITE` | `NaN`/`Inf` encountered with `NONFINITE_POLICY = FAIL`. |
| `FDDP_E_CODEBOOK_MISSING` | Referenced codebook digest unresolvable. |
| `FDDP_E_COUNT_MISMATCH` | `token_count` inconsistent with `DATA` length. |
| `FDDP_E_TRUNCATED` | Container ends before `IEND`. |
| `FDDP_E_NO_RECONSTRUCT` | Reconstruction requested at L0 or on analysis-only lanes. |
| `FDDP_E_SIGNATURE_INVALID` | `PROV` verification failed. |

Errors **MUST** be fatal to the affected operation. No error in this table has a defined
"best effort" continuation.

---

## 20. Versioning and Extensibility

- `version_major` increments on any change that makes a v1 decoder misinterpret a
  container. Decoders **MUST** reject unknown majors.
- `version_minor` increments for additions expressible through ancillary chunks or new
  registry IDs. Decoders **MUST** accept unknown minors and fail only on the specific
  unknown *critical* construct encountered.
- Registry IDs `0x80`–`0xFE` in every registry (lane kinds, transforms, windows, band
  schemes, channels, quantizers) are reserved for private use and **MUST NOT** appear in
  containers intended for interchange. `0xFF` is reserved as an escape for a future
  16-bit extension.
- New profiles are additive and carry their own IDs; existing profile IDs are immutable.
  A profile is never "revised" — a changed parameter set is a new profile.

---

## 21. Worked Example

**Input.** A 4 096-octet buffer, Profile A defaults, `ANCHOR_MODE = FIXED`.

**S1.** Two lanes: `U8_CENTERED` and `ENTROPY` (`W_e = 64`). `L = 2`.

**S2.** `N = 1024`, `H = 512`, `PAD_ZERO`, periodic Hann.
`M_pad = 4608`, `T = 1 + ⌊(4608 − 1024)/512⌋ = 8` frames.

**S3.** Orthonormal DCT-II ⇒ `K = 1024` per frame.

**S4.** Channels `{LOGMAG, FLUX_T}` ⇒ `C = 2`. `FLUX_T[0,·] = 0`.

**S5.** `DYADIC` edges clipped to `K`: `[0,1,2,4,8,16,32,64,128,256,512,1024]` — 11 bands
after the mandatory merge of the degenerate leading pair, so `J = 11`, not the nominal 16.
The `BAND` chunk transports the 12-entry edge array explicitly.
`G = 4` ⇒ 2 time groups. `RESAMPLE_FIXED` with `K_p = 16`.

Patch tensor shape: `4 × 16 × 2` = 128 values.

Token count: `1 segment × 1 scale × 2 groups × 2 lanes × 11 bands = 44` tokens.

**S6.** `RUNNING_Z`, `λ = 64`, warm-started from the `NORM` global table.

**S7.** `AFFINE_INT8` ⇒ 128 octets body + 8 octets side-channel = 136 octets per patch.

**Budget.** `DATA = 44 × 136 = 5 984` octets over a 4 096-octet source ⇒
`bits_per_source_octet = 11.69`. This exceeds Profile A's `≤ 2.0` target by roughly 6×,
and the reason is instructive: at 4 KiB the source spans only 8 frames, so the
per-patch side-channel and the fixed 11-band partition are both amortized over almost
nothing. Profile A's budget is stated for sources `≥ 1 MiB`. Encoders handling small
objects **SHOULD** reduce `J` (dyadic bands below `k = 32` carry little for byte data),
raise `G`, or fall back to a spatial representation entirely — a frequency patching of
eight frames is not a meaningful spectral estimate.

---

## 22. Design Rationale (Non-Normative)

**Why bands rather than uniform bins.** Uniform binning gives every frequency equal
representational weight, but the information density of natural data is roughly
log-uniform in frequency. Dyadic and mel-like partitions match token budget to
information density, which is the whole point of patching.

**Why time-grouping before projection.** A single-frame patch has no temporal extent and
therefore cannot express modulation — the rate of spectral change, which is frequently
more diagnostic than the spectrum itself. `G ≥ 2` with `FLUX_T` makes modulation a linear
readout of the token rather than a comparison across tokens.

**Why the side-channel is mandatory.** Per-patch normalization is what makes quantization
viable across a 10-decade dynamic range, and it is also what destroys absolute scale. The
two facts are inseparable; the only correct resolution is to normalize *and* transport
the normalizer. Specifications that omit this produce representations in which relative
structure is beautifully preserved and absolute magnitude is simply gone.

**Why content-defined anchoring is optional but specified.** It costs a rolling hash pass
and a modest loss of grid regularity, and it buys a roughly 18× improvement in the
shift-invariance score (§17.3). For corpora of versioned artifacts — source trees,
document revisions, append-only logs — that trade is overwhelmingly favourable. For
single-pass sensor streams it is pure overhead. Hence: specified, defaulted on in
Profile A, and switchable.

**Why Profile E has a coherence channel.** In relational and socioeconomic series, the
interesting quantity is rarely the level of a single group's indicator; it is whether two
groups' indicators move together, at what band, and with what lag. Magnitude-squared
coherence per band, plus phase-derivative channels for lead/lag, express exactly this as
a fixed-width patch feature. It converts a claim that would otherwise be argued
qualitatively — "these two populations' fortunes became coupled at generational
timescales after 1870" — into a scalar that a model can attend to.

---

## Appendix A — Normative Tables

### A.1 Gear Hash Table

The 256-entry `u64` Gear table is defined as `GEAR[i] = splitmix64(i + 0x9E3779B97F4A7C15)`
for `i ∈ [0, 256)`, where `splitmix64` is the standard construction:

    z = seed + 0x9E3779B97F4A7C15
    z = (z XOR (z >> 30)) * 0xBF58476D1CE4E5B9
    z = (z XOR (z >> 27)) * 0x94D049BB133111EB
    return z XOR (z >> 31)

Defining the table by construction rather than by literal listing eliminates
transcription error and makes the table independently verifiable.

### A.2 Profile A Dyadic Band Edges (`K = 1024`)

    [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]     ⇒ J = 11

### A.3 Recommended `δ` Values

| Payload precision | `δ` |
|---|---|
| f32 | `1e−6` |
| f16 | `1e−4` |
| int8 after peak norm | `1e−3` |

### A.4 CRC-32C

Polynomial `0x1EDC6F41` (reflected `0x82F63B78`), initial value `0xFFFFFFFF`, reflected
input and output, final XOR `0xFFFFFFFF`.

---

## Appendix B — Reference Encoder Pseudocode (Non-Normative)

    procedure ENCODE(stream, eps) -> container
        canonical  <- CANONICALIZE(stream)
        segments   <- (eps.anchor = CDC) ? CUT_CDC(canonical, eps) : [canonical]
        emit HEADER(eps)
        for each segment in segments
            lanes <- PROJECT_LANES(segment, eps.lane_spec)
            for scale in 0 .. eps.S-1
                N <- eps.N0 << scale ; H <- eps.H0 << scale
                for each lane in lanes
                    frames   <- FRAME(lane, N, H, eps.pad)
                    spectra  <- for f in frames: TRANSFORM(WINDOW(f, eps.window), eps.xfrm)
                    channels <- BUILD_CHANNELS(spectra, eps.chan)
                    for group in GROUPS(channels, eps.G)
                        for band in eps.bands[scale]
                            tile <- SLICE(group, band)
                            tile <- RESAMPLE(tile, eps.Kp)        -- linear domain
                            (tile, side) <- NORMALIZE(tile, eps.norm)
                            payload <- QUANTIZE(tile, eps.quant)
                            EMIT_PATCH(side, payload)
                            UPDATE_RUNNING_STATS(eps.norm, tile)
        emit STAT, IEND

Note that `RESAMPLE` precedes `NORMALIZE`, and `UPDATE_RUNNING_STATS` follows
`EMIT_PATCH`. Both orderings are normative (§10.2, §11.1) and both are easy to get
backwards.

---

## Appendix C — Change Log

| Version | Change |
|---|---|
| 1.0 | Initial specification. Registries for lane kinds, transforms, windows, band schemes, channels, and quantizers frozen. Profiles A–E defined. Conformance classes Core / Extended / Full established. |
