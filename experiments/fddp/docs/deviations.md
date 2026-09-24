# Deviations from FDDP v1.0

Every entry is numbered, cites the clause, and states whether the deviation is
stricter or looser than the specification. Nothing in this list is a silent
degradation: each one is either enforced in code or surfaced in the UI.

## D-01 — Profile C's 2-D ⇄ 1-D binding is not specified by v1.0
§6.3 gives Profile C in a vocabulary (frame, hop, time group) that is temporal.
Our binding — block = frame, zig-zag index = bin, 2×2 block quad = time group —
is declared explicitly in `XTRA/IMGD`. A decoder that cannot find `IMGD` fails
with `FDDP_E_NO_RECONSTRUCT` rather than guessing at the geometry.
*Additive. Neither stricter nor looser; it fills a hole.*

## D-02 — presets refuse to declare L2 under RESAMPLE_FIXED
§10.2 decimates a 120-coefficient band to 16 slots. Band energy survives
exactly (§17.1); individual coefficients do not. L2's 1e-4 is unreachable, and
the sign of each coefficient is gone entirely. The encoder therefore decodes
its own output, measures, and writes the level it demonstrated.
*Stricter than the spec.*

## D-03 — "zig-zag radial rings" realised as contiguous zig-zag runs
True radial rings are not contiguous in zig-zag order, and §10.1 requires bands
to be contiguous, non-overlapping bin ranges. We use triangular-number edges
`[0,1,3,6,10,15,21,36,66,136,256]`, transported as scheme `0x07 EXPLICIT`.
The rejected alternative — a bin permutation in `XTRA` plus scheme `0x06` — is
more faithful to the word "radial" and less faithful to §10.1.

## D-04 — private channel `0x80 LINEAR_PEAK`
§20 reserves `0x80–0xFE` for private use and forbids them in interchange
containers. Any container using one sets `eps.nonInterchange` and the UI
labels the export in red.

## D-05 — the area average is over POWER, rooted
§10.2 mandates linear-domain averaging and explains why (a log-domain mean is
a geometric mean, biasing wide bands downward). But an *arithmetic* mean of
linear magnitudes does not preserve band energy either, and §17.1 demands
energy preservation to 1e-5. We average squares and take the root: still
strictly linear domain, exactly energy-preserving, and `tests/pipeline.test.js`
carries the negative control proving the guard can fail.

## D-06 — per-patch quantiser step is derived, not transported
§11.3 allows a per-patch Δ and z, but §11.2 fixes the side-channel at eight
bytes with one `log_scale` field. Rather than overload that field, Δ is derived
deterministically from `NORM.quantRange` and the transported normaliser, and
`quantRange` is carried in the `NORM` chunk. Consequence, enforced in
`resolveEPS`: integer quantisation with `NORM = NONE` is rejected with
`FDDP_E_PARAM`, because that combination has no transportable scale.

## D-07 — the `faithful` preset uses f32, not f16
§13.1 offers L2 at 1e-4 "for f16 payloads". In the log domain this is not
achievable: f16 carries ~5e-4 relative precision, and on a `SIGNED_LOGMAG`
value of magnitude ~14 that is ~7e-3 absolute, which maps to ~0.7 % *relative*
error in the coefficient — 70× over threshold. The plan's original `faithful`
row was arithmetically impossible. f32 measures ≲1e-6 and is verified.

## D-08 — Profile A channel set
§6.1 specifies `{log-mag, Δt log-mag}`. `LOGMAG` discards the sign of a real
DCT coefficient, which makes reconstruction of byte data meaningless at any
level. Our Profile A presets use `SIGNED_LOGMAG` (`0x02`, a registered ID).
`FLUX_T` remains available as an override.

## D-09 — no Workers in this drop
Plan §6 budgets Workers and transfers. This build runs on the main thread with
a default downscale to 512 px longest edge. The module boundaries are already
pure functions over typed arrays, so the worker shell is additive. Until then,
the UI does not pretend to be cancellable.

## D-10 — visual carrier (plan §7, M7/M8) not implemented
The camera works as an *image source* (M5). It does not yet work as a
*container reader*. The decode panel accepts `.fddp` files only, and there is
no "Scan with camera" button, because a button that cannot succeed is worse
than an absent one.

## D-11 — §15.3 contradicts §15.4 on chunk criticality
§15.3: "Bit 5 of byte 0 clear ⇒ critical." `XTRA` is `0x58` and `STAT` is
`0x53`; both have bit 5 clear, so both are critical by the bit rule — yet
§15.4 lists both as ancillary. We resolve by **name for registered types,
bit rule for unregistered types**, which preserves the intent of both clauses
and keeps the unknown-chunk behaviour of §15.3 exactly as specified. A future
spec revision should rename them `xTRA`/`sTAT` or drop the bit rule.

## D-12 — L3 not claimed
§13.1 L3 requires an integer-exact transform (`WHT` or lifting DWT). DCT-II is
not one, so even when the reconstruction is byte-equal we declare L2 and
report `byteExact: true` in `STAT`. Claiming L3 on a non-integer transform
would be a lie that happened to be true for one input.
## D-13 — frame count follows §21, not a literal reading of §7.1
For the lane-extending padding policies (`ZERO`, `REFLECT`, `WRAP`) we take
`T = ⌈M/H⌉`, `M_pad = N + (T−1)·H`. This reproduces §21 exactly
(`M = 4096 ⇒ M_pad = 4608, T = 8`) and guarantees every source sample lies
under a frame that is not the last one. `PAD_DROP` keeps only whole frames.
*Clarifies an under-specified clause; matches the spec's own example.*
## D-14 — Profile A presets use centred framing
`bytes-a` and `bytes-faithful` set `CENTERED = 1` (§7.2, signalled in `FHDR`).
With periodic Hann and `CENTERED = 0`, `w[0] = 0` and octet 0 is unrecoverable
by any decoder, and octets 1–3 sit under a ≈1e-5 window gain that amplifies
f32 rounding into whole byte units. Centring puts the whole source under the
COLA-flat interior, and `bytes-faithful` is then byte-exact (measured, L2).
Pass `{ centered: 0 }` to reproduce §21 verbatim; the test suite does.
*A permitted option, chosen as the default for byte data.*
## D-15 — `RESAMPLE_FIXED` containers declare `LOGMAG`
The §10.2 area average runs on `|X|` and therefore discards sign. A request for
`SIGNED_LOGMAG` under `RESAMPLE_FIXED` is rewritten to `LOGMAG` at EPS
resolution so that the `CHAN` chunk describes what the payload contains.
*Stricter labelling; no change to the payload.*
## D-16 — the EMA is closed-loop, and the normaliser is f16-exact
§11.1 says the running statistics move only after the patch is emitted, and
§13.2 says the decoder replays the same schedule. Under quantisation those two
can only agree if both sides update from the *same* numbers — the dequantised,
denormalised patch — so the encoder now dequantises its own payload in memory
(`quantize()` returns `recon`) and updates from that. Separately, `PATCH_Z`,
`PEAK`, and `RUNNING_Z` normalise with mean and `log2(scale)` already rounded
through f16, so the transported side-channel is the value that was used rather
than an approximation of it. `tests/pipeline.test.js` asserts the decoder's
replayed state *predicts* every transported side-channel, and carries a
negative control (update-before-emit) that must fail.
*Stricter than the spec's wording; required for its reproducibility claim.*
## Errata fixed in this drop (not deviations)
- `verifyCola` scanned `[H, N−H)`, an empty range whenever `H ≥ N/2`; the
   resulting `NaN` was reported as `FDDP_E_COLA_VIOLATION` for every profile.
- `resolveEPS` attempted to `Object.freeze` a `Uint32Array` (TypeError).
- The `XFRM` payload was 2 bytes short of its own layout (RangeError on write).
- `NO_RECONSTRUCT` was raised on every L0 container; §13.3 ties it to the lane
   set, and an L0 container is now decoded and *labelled* L0.
- The decoder now rebuilds its EPS from `XFRM`, `BAND`, `CHAN`, `NORM`, `QUAN`
   and the `FHDR` flags rather than from preset defaults (§16.2).