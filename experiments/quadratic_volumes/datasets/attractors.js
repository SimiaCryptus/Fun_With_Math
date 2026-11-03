// Continuous-time attractors (RK4) plus the Hénon sweep and swiss roll.
// All outputs are normalized into [0,1]^3 with a small margin.

function normalize(pts, margin = 0.02) {
  const n = pts.length / 3;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = pts[i * 3 + k];
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const s = hi[k] - lo[k] || 1;
      pts[i * 3 + k] = margin + (1 - 2 * margin) * ((pts[i * 3 + k] - lo[k]) / s);
    }
  }
  return pts;
}

function integrate(f, x0, { dt, burn, N }) {
  const x = Float64Array.from(x0);
  const k1 = new Float64Array(3), k2 = new Float64Array(3);
  const k3 = new Float64Array(3), k4 = new Float64Array(3);
  const tmp = new Float64Array(3);
  const step = () => {
    f(x, k1);
    for (let i = 0; i < 3; i++) tmp[i] = x[i] + 0.5 * dt * k1[i];
    f(tmp, k2);
    for (let i = 0; i < 3; i++) tmp[i] = x[i] + 0.5 * dt * k2[i];
    f(tmp, k3);
    for (let i = 0; i < 3; i++) tmp[i] = x[i] + dt * k3[i];
    f(tmp, k4);
    for (let i = 0; i < 3; i++) {
      x[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
  };
  for (let i = 0; i < burn; i++) step();
  const out = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    step();
    out[i * 3] = x[0]; out[i * 3 + 1] = x[1]; out[i * 3 + 2] = x[2];
  }
  return normalize(out);
}

export const lorenz = {
  id: 'lorenz',
  name: 'Lorenz attractor',
  description: 'Classic butterfly: fractal-ish 2D sheet structure.',
  params: {
    sigma: { value: 10, min: 1, max: 20, step: 0.5 },
    rho: { value: 28, min: 1, max: 60, step: 0.5 },
    beta: { value: 8 / 3, min: 0.5, max: 5, step: 0.05 },
    dt: { value: 0.006, min: 0.001, max: 0.02, step: 0.001 },
  },
  generate(p, rng, N = 20000) {
    const s = p.sigma ?? 10, r = p.rho ?? 28, b = p.beta ?? 8 / 3;
    return integrate((x, o) => {
      o[0] = s * (x[1] - x[0]);
      o[1] = x[0] * (r - x[2]) - x[1];
      o[2] = x[0] * x[1] - b * x[2];
    }, [rng.range(-1, 1), rng.range(-1, 1), rng.range(10, 20)],
    { dt: p.dt ?? 0.006, burn: 2000, N });
  },
  truth: { type: 'none', codim: 1 },
};

export const rossler = {
  id: 'rossler',
  name: 'Rössler attractor',
  description: 'Thin folded band.',
  params: {
    a: { value: 0.2, min: 0.05, max: 0.4, step: 0.01 },
    b: { value: 0.2, min: 0.05, max: 1, step: 0.01 },
    c: { value: 5.7, min: 2, max: 12, step: 0.1 },
    dt: { value: 0.03, min: 0.005, max: 0.1, step: 0.005 },
  },
  generate(p, rng, N = 20000) {
    const a = p.a ?? 0.2, b = p.b ?? 0.2, c = p.c ?? 5.7;
    return integrate((x, o) => {
      o[0] = -x[1] - x[2];
      o[1] = x[0] + a * x[1];
      o[2] = b + x[2] * (x[0] - c);
    }, [rng.range(-1, 1), rng.range(-1, 1), rng.range(0, 1)],
    { dt: p.dt ?? 0.03, burn: 2000, N });
  },
  truth: { type: 'none', codim: 1 },
};

export const thomas = {
  id: 'thomas',
  name: 'Thomas attractor',
  description: 'Cyclically symmetric, many lobes. Stress test.',
  params: {
    b: { value: 0.1998, min: 0.1, max: 0.3, step: 0.001 },
    dt: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
  },
  generate(p, rng, N = 20000) {
    const b = p.b ?? 0.1998;
    return integrate((x, o) => {
      o[0] = Math.sin(x[1]) - b * x[0];
      o[1] = Math.sin(x[2]) - b * x[1];
      o[2] = Math.sin(x[0]) - b * x[2];
    }, [rng.range(0, 1), rng.range(0, 1), rng.range(0, 1)],
    { dt: p.dt ?? 0.05, burn: 3000, N });
  },
  truth: { type: 'none', codim: 1 },
};

export const henonSweep = {
  id: 'henon-sweep',
  name: 'Hénon sweep ribbon',
  description: 'Hénon map swept over a: a second bifurcation ribbon.',
  params: {
    a0: { value: 0.6, min: 0, max: 1.5, step: 0.01 },
    a1: { value: 1.4, min: 0, max: 1.5, step: 0.01 },
    b: { value: 0.3, min: 0, max: 0.5, step: 0.01 },
    burn: { value: 500, min: 0, max: 3000, step: 100 },
    M: { value: 20, min: 1, max: 200, step: 1 },
  },
  generate(p, rng, N = 20000) {
    const a0 = p.a0 ?? 0.6, a1 = p.a1 ?? 1.4, b = p.b ?? 0.3;
    const burn = Math.round(p.burn ?? 500), M = Math.max(1, Math.round(p.M ?? 20));
    const out = new Float64Array(N * 3);
    let w = 0;
    while (w < N) {
      const s = rng.uniform();
      const a = a0 + (a1 - a0) * s;
      let x = rng.range(-0.2, 0.2), y = rng.range(-0.2, 0.2);
      let ok = true;
      for (let i = 0; i < burn; i++) {
        const nx = 1 - a * x * x + y;
        y = b * x; x = nx;
        if (!isFinite(x) || Math.abs(x) > 10) { ok = false; break; }
      }
      if (!ok) continue;
      for (let m = 0; m < M && w < N; m++) {
        const nx = 1 - a * x * x + y;
        y = b * x; x = nx;
        if (!isFinite(x) || Math.abs(x) > 10) break;
        out[w * 3] = s;
        out[w * 3 + 1] = x;
        out[w * 3 + 2] = y;
        w++;
      }
    }
    return normalize(out);
  },
  truth: { type: 'none', codim: 'varies' },
};

export const swissRoll = {
  id: 'swiss-roll',
  name: 'swiss roll',
  description: 'Curved 2D sheet embedded in the cube.',
  params: { noise: { value: 0.005, min: 0, max: 0.05, step: 0.001 } },
  generate(p, rng, N = 20000) {
    const s = p.noise ?? 0.005;
    const out = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = 1.5 * Math.PI * (1 + 2 * rng.uniform());
      out[i * 3] = t * Math.cos(t) + s * rng.normal() * 10;
      out[i * 3 + 1] = 21 * rng.uniform();
      out[i * 3 + 2] = t * Math.sin(t) + s * rng.normal() * 10;
    }
    return normalize(out);
  },
  truth: { type: 'none', codim: 1 },
};