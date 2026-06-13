// Generation of the algebraic colored lattice field eta : Z^d -> K^d.
    //
    // eta(x) = sum_{k=1}^{K} ( r_k * sin(2*pi*alpha_k . x)
    //                       + s_k * sqrt(D) * cos(2*pi*beta_k . x) )
    //
    // where alpha_k, beta_k are incommensurate frequency vectors derived
    // deterministically from the algebraic structure of Q(sqrt(D)).

    import { QuadField } from "./algebra.js";

    // Deterministic pseudo-irrational vector built from sqrt(D) and a seed.
    // Produces frequencies that are algebraically related but not commensurate
    // with the integer lattice.
    function makeFrequencies(D, K, alphaScale, seed) {
      const sqrtD = Math.sqrt(D);
      const phi = (1 + Math.sqrt(5)) / 2;
      const alphas = [];
      const betas = [];
      const phases = [];
      const ampsR = [];
      const ampsS = [];

      for (let k = 1; k <= K; k++) {
        // Build alpha_k, beta_k in [-alphaScale, alphaScale]^2
        // using algebraic combinations of sqrt(D), phi, and k.
        const ax = alphaScale * fractCentered(k * sqrtD + 0.137 * seed);
        const ay = alphaScale * fractCentered(k * phi + 0.241 * seed);
        const bx = alphaScale * fractCentered(k * sqrtD * phi + 0.353 * seed);
        const by = alphaScale * fractCentered((k + 1) * sqrtD - 0.467 * seed);
        alphas.push([ax, ay]);
        betas.push([bx, by]);
        phases.push([
          2 * Math.PI * fractCentered(k * 0.6180339 + 0.1 * seed),
          2 * Math.PI * fractCentered(k * 0.7548776 + 0.2 * seed),
        ]);
        // Spectral weights: 1/k for pink-ish tilt.
        ampsR.push(1 / k);
        ampsS.push(1 / k);
      }

      return { alphas, betas, phases, ampsR, ampsS };
    }

    function fractCentered(v) {
      const f = v - Math.floor(v);
      return f - 0.5; // in [-0.5, 0.5)
    }

    // Compute eta(x) for one lattice site, returning a 2D vector of QuadField
    // elements: [ [a_x, b_x], [a_y, b_y] ].
    export function etaAt(x, y, params, K_field) {
      const { alphas, betas, phases, ampsR, ampsS } = params;
      let ax = 0, ay = 0, bx = 0, by = 0;
      const K = alphas.length;
      for (let k = 0; k < K; k++) {
        const a = alphas[k];
        const b = betas[k];
        const ph = phases[k];
        const rk = ampsR[k];
        const sk = ampsS[k];

        const angA = 2 * Math.PI * (a[0] * x + a[1] * y) + ph[0];
        const angB = 2 * Math.PI * (b[0] * x + b[1] * y) + ph[1];

        const sA = Math.sin(angA);
        const cB = Math.cos(angB);

        // x-component
        ax += rk * sA;
        bx += sk * cB;
        // y-component, rotated by pi/2-ish via swapping cos/sin
        ay += rk * Math.cos(angA + 0.5);
        by += sk * Math.sin(angB + 0.5);
      }
      return [[ax, bx], [ay, by]];
    }

    // Compute a scalar field over a grid using the chosen mode.
    // Returns Float32Array of length size*size and {min, max}.
    export function computeField(opts) {
      const { D, size, K, alphaScale, seed, mode, epsilon } = opts;
      const field = new QuadField(D);
      const params = makeFrequencies(D, K, alphaScale, seed);
      const out = new Float32Array(size * size);

      let minV = Infinity, maxV = -Infinity;
      let irrSumSq = 0, irrCount = 0;

      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          // Center the grid for symmetric viewing.
          const x = i - size / 2;
          const y = j - size / 2;
          const e = etaAt(x, y, params, K);

          // e = [ [a_x, b_x], [a_y, b_y] ]
          const ax = e[0][0], bx = e[0][1];
          const ay = e[1][0], by = e[1][1];

          // Real-valued component (embedding into R).
          const rx = ax + bx * field.sqrtD;
          const ry = ay + by * field.sqrtD;

          // Track irrational magnitude (used for rigidity diagnostics).
          const irr2 = bx * bx + by * by;
          irrSumSq += irr2;
          irrCount++;

          let v;
          switch (mode) {
            case "rational":
              v = Math.hypot(ax, ay);
              break;
            case "irrational":
              v = Math.hypot(bx, by) * field.sqrtD;
              break;
            case "snapped": {
              // Snap T_eps(x) = x + eps * eta(x) to nearest integer lattice.
              const tx = x + epsilon * rx;
              const ty = y + epsilon * ry;
              const sx = Math.round(tx);
              const sy = Math.round(ty);
              v = Math.hypot(tx - sx, ty - sy);
              break;
            }
            case "magnitude":
            default:
              v = Math.hypot(rx, ry);
              break;
          }

          out[j * size + i] = v;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }

      const irrRMS = Math.sqrt(irrSumSq / irrCount);
      return { data: out, min: minV, max: maxV, irrRMS };
    }