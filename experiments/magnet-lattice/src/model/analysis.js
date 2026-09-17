// Equilibrium finding, normal modes, and coupling matrix.

import {energy, gradient, hessian} from './physics.js';
import {jacobiEigen, luSolve} from '../math/linalg.js';

function norm(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
}

/**
 * In-place gradient descent with Armijo backtracking.
 * Stops when |∇U| < tol, after maxIter iterations, or when the step size
 * underflows (the energy can no longer be resolved in floating point).
 */
function descend(theta, pairs, n, maxIter, tol) {
    let alpha = 0.1;
    let iterations = 0;
    let gradNorm = Infinity;
    for (iterations = 0; iterations < maxIter; iterations++) {
        const g = gradient(theta, pairs, n);
        gradNorm = norm(g);
        if (gradNorm < tol) break;

        const E0 = energy(theta, pairs);
        let s = alpha;
        let accepted = false;
        const trial = new Float64Array(n);
        for (let ls = 0; ls < 30; ls++) {
            for (let i = 0; i < n; i++) trial[i] = theta[i] - s * g[i];
            const E1 = energy(trial, pairs);
            if (E1 < E0 - 1e-4 * s * gradNorm * gradNorm) {
                theta.set(trial);
                alpha = s * 1.5;
                accepted = true;
                break;
            }
            s *= 0.5;
        }
        if (!accepted) {
            alpha *= 0.5;
            if (alpha < 1e-14) break;
        }
    }
    return {iterations, gradNorm};
}

/**
 * Relax to equilibrium.
 *
 * Phase 1: gradient descent (robust, finds the basin).
 * Phase 2: Newton polish with the analytic Hessian. Pure gradient descent
 *          stalls around |∇U| ~ 1e-8 because energy differences fall below
 *          floating-point resolution; Newton converges quadratically to ~1e-15.
 *          Steps are only accepted along descent directions that shrink |∇U|
 *          without raising U, so a saddle cannot be "polished into".
 * Phase 3: fall back to gradient descent at the fine tolerance if Newton bailed.
 *
 * Returns { theta, iterations, gradNorm }.
 */
export function relax(theta0, pairs, n, opts = {}) {
    const {maxIter = 2000, tol = 1e-9, newtonIter = 25, coarseTol = 1e-4} = opts;
    const theta = Float64Array.from(theta0);
    let iterations = 0;

    let r = descend(theta, pairs, n, maxIter, Math.max(coarseTol, tol));
    iterations += r.iterations;
    let gradNorm = r.gradNorm;

    for (let it = 0; it < newtonIter && gradNorm > tol; it++) {
        const g = gradient(theta, pairs, n);
        const H = hessian(theta, pairs, n);
        const rhs = new Float64Array(n);
        for (let i = 0; i < n; i++) rhs[i] = -g[i];
        let d;
        try {
            d = luSolve(H, rhs);
        } catch {
            break; // singular Hessian
        }
        let slope = 0;
        for (let i = 0; i < n; i++) slope += g[i] * d[i];
        if (!(slope < 0)) break; // not a descent direction (indefinite Hessian)

        const trial = new Float64Array(n);
        for (let i = 0; i < n; i++) trial[i] = theta[i] + d[i];
        const gn = norm(gradient(trial, pairs, n));
        const E0 = energy(theta, pairs);
        const E1 = energy(trial, pairs);
        if (!(gn < gradNorm) || E1 > E0 + 1e-12 * Math.max(1, Math.abs(E0))) break;
        theta.set(trial);
        gradNorm = gn;
        iterations++;
    }

    if (gradNorm > tol) {
        r = descend(theta, pairs, n, maxIter, tol);
        iterations += r.iterations;
        gradNorm = r.gradNorm;
    }

    // wrap into [-π, π]
    for (let i = 0; i < n; i++) theta[i] = Math.atan2(Math.sin(theta[i]), Math.cos(theta[i]));
    return {theta, iterations, gradNorm};
}

/**
 * Normal-mode analysis at (or near) equilibrium.
 * Generalized eigenproblem H v = ω² M v with M = I·Identity, so ω² = eig(H)/I.
 * Returns { H, C, values, omega2, omega, modes }.
 * `omega[i]` is negative (−sqrt|ω²|) when the mode is unstable.
 */
export function analyze(theta, pairs, n, params) {
    const {I} = params;
    const H = hessian(theta, pairs, n);
    const {values, vectors} = jacobiEigen(H);

    const omega2 = new Float64Array(n);
    const omega = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        omega2[i] = values[i] / I;
        omega[i] = omega2[i] >= 0 ? Math.sqrt(omega2[i]) : -Math.sqrt(-omega2[i]);
    }

    // Normalized coupling matrix C_ij = H_ij / sqrt(|H_ii H_jj|)
    const C = new Array(n);
    for (let i = 0; i < n; i++) {
        C[i] = new Float64Array(n);
        for (let j = 0; j < n; j++) {
            const denom = Math.sqrt(Math.abs(H[i][i] * H[j][j]));
            C[i][j] = denom > 1e-30 ? H[i][j] / denom : 0;
        }
    }

    return {H, C, values, omega2, omega, modes: vectors};
}
// ---- Symmetries -------------------------------------------------------------
//
// Two configurations are treated as the same "state" when one maps onto the
// other by a symmetry of the energy:
//   * a point-group operation of the square lattice (rotation by a multiple of
//     90° or a reflection about the centroid) that maps the magnet position set
//     onto itself — positions are permuted and every dipole vector is rotated /
//     reflected along with them; the dipole energy only depends on dot products
//     so it is invariant;
//   * the global dipole flip θ_i → θ_i + π for all i (U is bilinear in dipoles).
function wrapAngle(a) {
     return Math.atan2(Math.sin(a), Math.cos(a));
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** D4 as 2×2 matrices [a, b, c, d]: (x, y) -> (a x + b y, c x + d y). */
const D4 = [
     {name: 'e', M: [1, 0, 0, 1]},
     {name: 'r90', M: [0, -1, 1, 0]},
     {name: 'r180', M: [-1, 0, 0, -1]},
     {name: 'r270', M: [0, 1, -1, 0]},
     {name: 'mx', M: [1, 0, 0, -1]}, // reflect across the x-axis (y -> -y)
     {name: 'my', M: [-1, 0, 0, 1]}, // reflect across the y-axis
     {name: 'md', M: [0, 1, 1, 0]}, // reflect across y = x
     {name: 'md2', M: [0, -1, -1, 0]}, // reflect across y = -x
];
/**
  * Point-group operations (about the centroid) that map the position set onto
  * itself. Each op is { name, M, perm } where magnet i is sent to perm[i].
  */
export function latticeSymmetries(positions, tol = 1e-6) {
     const n = positions.length;
     if (n === 0) return [];
     let cx = 0,
         cy = 0;
     for (const p of positions) {
         cx += p[0];
         cy += p[1];
     }
     cx /= n;
     cy /= n;
     const ops = [];
     for (const {name, M} of D4) {
         const [a, b, c, d] = M;
         const perm = new Int32Array(n);
         const used = new Uint8Array(n);
         let ok = true;
         for (let i = 0; i < n && ok; i++) {
             const x = positions[i][0] - cx,
                 y = positions[i][1] - cy;
             const tx = a * x + b * y + cx,
                 ty = c * x + d * y + cy;
             let found = -1;
             for (let j = 0; j < n; j++) {
                 if (!used[j] && Math.abs(positions[j][0] - tx) < tol && Math.abs(positions[j][1] - ty) < tol) {
                     found = j;
                     break;
                 }
             }
             if (found < 0) ok = false;
             else {
                 perm[i] = found;
                 used[found] = 1;
             }
         }
         if (ok) ops.push({name, M, perm});
     }
     return ops;
}
/** Apply a point-group op to a configuration: dipoles are permuted and transformed by M. */
export function transformState(theta, op) {
     const [a, b, c, d] = op.M;
     const n = theta.length;
     const out = new Float64Array(n);
     for (let i = 0; i < n; i++) {
         const cs = Math.cos(theta[i]),
             sn = Math.sin(theta[i]);
         out[op.perm[i]] = Math.atan2(c * cs + d * sn, a * cs + b * sn);
     }
     return out;
}
/** All images of θ under the point group extended by the global dipole flip. */
export function symmetryImages(theta, ops) {
     const n = theta.length;
     const out = [];
     for (const op of ops) {
         const img = transformState(theta, op);
         out.push(img);
         const flip = new Float64Array(n);
         for (let i = 0; i < n; i++) flip[i] = wrapAngle(img[i] + Math.PI);
         out.push(flip);
     }
     return out;
}
function maxAngleDiff(a, b) {
     let m = 0;
     for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(wrapAngle(a[i] - b[i])));
     return m;
}
/** True when some symmetry image of `a` coincides with `b` within `tol` (radians). */
export function statesEquivalent(a, b, ops, tol = 1e-4) {
     if (a.length !== b.length) return false;
     for (const img of symmetryImages(a, ops)) if (maxAngleDiff(img, b) < tol) return true;
     return false;
}
/**
  * Auto-identify a configuration: net moment, circulation about the centroid,
  * checkerboard-staggered moment, and human-readable tags.
  */
export function describeState(theta, positions) {
     const n = theta.length;
     let mx = 0,
         my = 0,
         cx = 0,
         cy = 0;
     for (let i = 0; i < n; i++) {
         mx += Math.cos(theta[i]);
         my += Math.sin(theta[i]);
         cx += positions[i][0];
         cy += positions[i][1];
     }
     cx /= n;
     cy /= n;
     const netMoment = Math.hypot(mx, my) / n;
     let circ = 0,
         rsum = 0,
         sx = 0,
         sy = 0,
         onGrid = true;
     for (let i = 0; i < n; i++) {
         const x = positions[i][0],
             y = positions[i][1];
         const rx = x - cx,
             ry = y - cy;
         const cs = Math.cos(theta[i]),
             sn = Math.sin(theta[i]);
         circ += rx * sn - ry * cs;
         rsum += Math.hypot(rx, ry);
         const px = Math.round(x),
             py = Math.round(y);
         if (Math.abs(px - x) > 1e-9 || Math.abs(py - y) > 1e-9) onGrid = false;
         const s = (px + py) & 1 ? -1 : 1;
         sx += s * cs;
         sy += s * sn;
     }
     const circulation = rsum > 0 ? circ / rsum : 0;
     const staggered = onGrid ? Math.hypot(sx, sy) / n : 0;
     const tags = [];
     if (n > 1 && netMoment > 0.999) tags.push('ferromagnetic (all aligned)');
     else if (n > 1 && staggered > 0.999) tags.push('checkerboard antiferromagnetic');
     else if (netMoment < 1e-3) tags.push('zero net moment');
     else tags.push(`net moment ${netMoment.toFixed(2)}`);
     if (Math.abs(circulation) > 0.9) tags.push(`vortex (${circulation > 0 ? 'CCW' : 'CW'})`);
     return {netMoment, circulation, staggered, tags};
}
// ---- Stable-state sweep -----------------------------------------------------
/**
  * Exhaustive-ish search for stable equilibria: relax from structured seeds and
* many random initial conditions, and merge configurations that are
* equivalent under the lattice symmetries + global flip. Every converged
* stationary point is kept — saddle points (negative Hessian curvature) are
* common in dipole lattices and are tagged rather than discarded. Work is
* done incrementally via runFor() so a UI can keep animating.
  */
export class MinimaSweep {
     constructor(positions, pairs, n, opts = {}) {
         this.positions = positions;
         this.pairs = pairs;
         this.n = n;
         this.total = Math.max(1, opts.starts ?? 200);
         this.matchTol = opts.matchTol ?? 1e-4;
         this.relaxOpts = {maxIter: opts.maxIter ?? 800, tol: opts.tol ?? 1e-8};
         this.random = opts.random ?? Math.random;
         this.ops = latticeSymmetries(positions);
         /** Catalogue of distinct stable states, sorted by energy. */
         this.catalog = [];
         this.done = 0;
         this.unconverged = 0;
         this.saddles = 0;
         this._seeds = this._structuredSeeds();
     }
     _structuredSeeds() {
         const {n, positions} = this;
         const seeds = [];
         for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) seeds.push(new Float64Array(n).fill(a));
         const checker = new Float64Array(n),
             rows = new Float64Array(n),
             cols = new Float64Array(n);
         for (let i = 0; i < n; i++) {
             const px = Math.round(positions[i][0]),
                 py = Math.round(positions[i][1]);
             checker[i] = (px + py) & 1 ? Math.PI : 0;
             rows[i] = py & 1 ? Math.PI : 0;
             cols[i] = px & 1 ? Math.PI / 2 : -Math.PI / 2;
         }
         seeds.push(checker, rows, cols);
         // tiny jitter so seeds sitting exactly on a saddle can escape
         for (const s of seeds) for (let i = 0; i < n; i++) s[i] += 1e-2 * (this.random() - 0.5);
         return seeds;
     }
     get finished() {
         return this.done >= this.total;
     }
     /** Run one relaxation. Returns the catalog entry it landed in (or null). */
     runOne() {
         const {n, pairs} = this;
         let theta0;
         if (this._seeds.length) theta0 = this._seeds.shift();
         else {
             theta0 = new Float64Array(n);
             for (let i = 0; i < n; i++) theta0[i] = (this.random() * 2 - 1) * Math.PI;
         }
         const r = relax(theta0, pairs, n, this.relaxOpts);
         this.done++;
         if (!(r.gradNorm < 1e-6)) {
             this.unconverged++;
             return null;
         }
         return this.addState(r.theta);
     }
     /** Run relaxations until finished or `budgetMs` elapsed. Returns `finished`. */
     runFor(budgetMs = 20) {
         if (this.finished) return true;
         const t0 = now();
         do {
             this.runOne();
         } while (!this.finished && now() - t0 < budgetMs);
         return this.finished;
     }
     /**
      * Insert a converged stationary point. Saddles/maxima are rejected; states
      * equivalent to an existing entry only bump its hit counter. Saddle points
      * (negative Hessian curvature) are kept and tagged rather than discarded —
      * for these dipole lattices they are a normal, expected outcome.
      */
     addState(theta) {
         const {n, pairs} = this;
         if (pairs.length === 0 && this.catalog.length) {
             this.catalog[0].hits++;
             return this.catalog[0];
         }
         for (const entry of this.catalog) {
             if (statesEquivalent(theta, entry.theta, this.ops, this.matchTol)) {
                 entry.hits++;
                 return entry;
             }
         }
         const H = hessian(theta, pairs, n);
         const lambdaMin = jacobiEigen(H).values[0];
        const isSaddle = lambdaMin < -1e-7;
        if (isSaddle) this.saddles++;
         let stabilizer = 0;
         for (const img of symmetryImages(theta, this.ops)) {
             if (maxAngleDiff(img, theta) < this.matchTol) stabilizer++;
         }
         const groupSize = 2 * this.ops.length;
         const entry = {
             id: 0,
             theta: Float64Array.from(theta),
             energy: energy(theta, pairs),
             lambdaMin,
            soft: !isSaddle && lambdaMin < 1e-6,
            saddle: isSaddle,
             hits: 1,
             stabilizer,
             orbit: Math.max(1, Math.round(groupSize / Math.max(1, stabilizer))),
             ...describeState(theta, this.positions),
         };
         if (entry.soft) entry.tags.push('soft mode (marginal)');
        if (entry.saddle) entry.tags.push('saddle point');
         this.catalog.push(entry);
         this.catalog.sort((a, b) => a.energy - b.energy);
         this.catalog.forEach((e, i) => (e.id = i + 1));
         return entry;
     }
}