/**
 * Capability probe → tier. The current build runs the CPU reference solver, so tiers
 * are CPU-sized; the GPU tiers of §10.1 map onto the same letters once the atlas
 * passes land. `grid` is [Nx, Ny, NzMax]; Nz is derived from H (Grid.forTier).
 */
export const TIERS = {
  A: { grid: [128, 64, 12], pIters: 60, twin: true,  target: 30, label: 'A (cpu-large)' },
  B: { grid: [96, 48, 8],   pIters: 50, twin: true,  target: 30, label: 'B (cpu)' },
  C: { grid: [64, 32, 6],   pIters: 40, twin: true,  target: 30, label: 'C (cpu-small)' },
  D: { grid: [48, 24, 4],   pIters: 30, twin: false, target: 15, label: 'D (cpu-min)' },
};

export function probeCapabilities() {
  const caps = { webgl2: false, floatRT: false, floatLinear: false, maxTex: 0, workers: typeof Worker !== 'undefined' };
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) {
      caps.webgl2 = true;
      caps.floatRT = !!gl.getExtension('EXT_color_buffer_float');
      caps.floatLinear = !!gl.getExtension('OES_texture_float_linear');
      caps.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* probe failed → defaults */ }
  return caps;
}

/** Micro-benchmark: Jacobi sweeps over a 64×32×6 array for `ms` milliseconds. */
export function benchmark(ms = 120) {
  const Nx = 64, Ny = 32, Nz = 6, N = Nx * Ny * Nz;
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) a[i] = Math.sin(i * 0.37);
  const t0 = performance.now(); let sweeps = 0;
  while (performance.now() - t0 < ms) {
    for (let k = 1; k < Nz - 1; k++) for (let j = 1; j < Ny - 1; j++) for (let i = 1; i < Nx - 1; i++) {
      const n = i + Nx * (j + Ny * k);
      b[n] = (a[n - 1] + a[n + 1] + a[n - Nx] + a[n + Nx] + a[n - Nx * Ny] + a[n + Nx * Ny]) / 6;
    }
    a.set(b); sweeps++;
  }
  const dt = performance.now() - t0;
  return { sweeps, ms: dt, cellsPerMs: (sweeps * N) / dt };
}

export function selectTier(caps, bench) {
  const c = bench.cellsPerMs;
  let tier = c > 9000 ? 'A' : c > 5000 ? 'B' : c > 2000 ? 'C' : 'D';
  return { tier, reason: `bench ${Math.round(c)} cells/ms`, backend: 'cpu' };
}