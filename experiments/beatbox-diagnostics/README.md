# Vocal Parkour — Live Diagnostics

This lab links out to the **Diagnostics / Settings** panel of
[Vocal Parkour](https://vp.cognotik.com/), a browser-based vocal-gesture
rhythm game. Make mouth sounds (hiss, airy, pop, hum — or record your own)
into your microphone and watch a real-time audio engine classify each
sound frame-by-frame.

> **Open it:** [vp.cognotik.com/#/diagnostics](https://vp.cognotik.com/#/diagnostics)
>
> Grant microphone access when prompted. **No sound ever leaves your
> device** — the mic signal is analyzed entirely client-side, and any
> calibration/training data is stored locally in IndexedDB.

## What the diagnostics panel shows

- **Live feature visualizer** — a radar plot of the current spectral
  feature vector, a scrolling history strip, and a live pitch readout.
- **Per-sound practice & calibration** — capture labeled feature vectors
  for each sound via timed/held windows or a guided rhythmic panel.
- **Raw training-data inspection** — browse and export the captured
  corpus as TSV.
- **Fine-grained DSP tuning** — adjust gate thresholds, gain, frequency
  bands, and pitch-tracker settings, with an auto-calibration assistant.

## How it works

1. The microphone feeds an `AudioWorkletNode` running the DSP engine
   (compiled WebAssembly, with a pure-JS fallback).
2. Each audio frame is windowed and FFT'd into a `FeatureVector`
   (spectral centroid, noise/voicing/tilt ratios, energy, transient
   onset, flatness, rolloff, plus an NSDF-based pitch estimate).
3. Feature vectors are gated for energy/transient onset, then either
   matched against hand-authored cluster centers or classified by a
   trained in-browser **RBF-SVM** (one-vs-rest ensemble).
4. Classified events drive the live Settings/Diagnostics UI.

Because feature vectors are only meaningful relative to the DSP
parameters that produced them, the app fingerprints the active DSP config
and automatically discards stale training data rather than silently
degrading detection quality.

## Related

Vocal Parkour is a sister project to Mathematical Explorations. For the
full game (calibration, custom sound library, and the rhythm rail), start
at [vp.cognotik.com](https://vp.cognotik.com/).
