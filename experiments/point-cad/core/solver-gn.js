// Default solver: damped Gauss-Newton / Levenberg-Marquardt with numerical
// Jacobians. Dense linear algebra, no dependencies.
import { statusFor } from "./problem.js";

const sq = (v) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return s;
};

function jacobian(problem, x) {
  const n = x.length;
  const m = problem.m;
  const J = new Float64Array(m * n);
  const xp = Float64Array.from(x);
  for (let j = 0; j < n; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(x[j]));
    xp[j] = x[j] + h;
    const rp = problem.residuals(xp);
    xp[j] = x[j] - h;
    const rm = problem.residuals(xp);
    xp[j] = x[j];
    for (let i = 0; i < m; i++) J[i * n + j] = (rp[i] - rm[i]) / (2 * h);
  }
  return J;
}

function normalEquations(J, r, m, n) {
  const JtJ = new Float64Array(n * n);
  const Jtr = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    const row = i * n;
    for (let a = 0; a < n; a++) {
      const ja = J[row + a];
      if (ja === 0) continue;
      Jtr[a] += ja * r[i];
      for (let b = a; b < n; b++) JtJ[a * n + b] += ja * J[row + b];
    }
  }
  for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) JtJ[a * n + b] = JtJ[b * n + a];
  return { JtJ, Jtr };
}

/** Solve A x = b (A: n×n row-major) by Gaussian elimination with pivoting. */
export function solveLinear(A, b, n) {
  const M = Float64Array.from(A);
  const v = Float64Array.from(b);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r * n + col]) > Math.abs(M[piv * n + col])) piv = r;
    const pv = M[piv * n + col];
    if (Math.abs(pv) < 1e-14) return null;
    if (piv !== col) {
      for (let k = 0; k < n; k++) {
        const t = M[col * n + k];
        M[col * n + k] = M[piv * n + k];
        M[piv * n + k] = t;
      }
      const t = v[col];
      v[col] = v[piv];
      v[piv] = t;
    }
    for (let r = col + 1; r < n; r++) {
      const f = M[r * n + col] / pv;
      if (f === 0) continue;
      for (let k = col; k < n; k++) M[r * n + k] -= f * M[col * n + k];
      v[r] -= f * v[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = v[r];
    for (let k = r + 1; k < n; k++) s -= M[r * n + k] * x[k];
    x[r] = s / M[r * n + r];
  }
  return x;
}

/** Numerical rank of an m×n row-major matrix. */
export function matrixRank(J, m, n) {
  if (m === 0 || n === 0) return 0;
  const M = Float64Array.from(J);
  let maxAbs = 0;
  for (let i = 0; i < M.length; i++) maxAbs = Math.max(maxAbs, Math.abs(M[i]));
  if (maxAbs === 0) return 0;
  const tol = 1e-7 * maxAbs;
  let rank = 0;
  let row = 0;
  for (let col = 0; col < n && row < m; col++) {
    let piv = row;
    for (let r = row + 1; r < m; r++) if (Math.abs(M[r * n + col]) > Math.abs(M[piv * n + col])) piv = r;
    if (Math.abs(M[piv * n + col]) <= tol) continue;
    if (piv !== row) {
      for (let k = 0; k < n; k++) {
        const t = M[row * n + k];
        M[row * n + k] = M[piv * n + k];
        M[piv * n + k] = t;
      }
    }
    for (let r = row + 1; r < m; r++) {
      const f = M[r * n + col] / M[row * n + col];
      if (f === 0) continue;
      for (let k = col; k < n; k++) M[r * n + k] -= f * M[row * n + k];
    }
    row++;
    rank++;
  }
  return rank;
}

function rigidBodyDof(problem) {
  const dim = problem.dim;
  if (problem.pointOffset.size === 0) return 0;
  const f = problem.fixedPointCount;
  if (dim === 3) return f === 0 ? 6 : f === 1 ? 3 : f === 2 ? 1 : 0;
  // generic: translations + rotations, minus what fixed points remove
  const full = dim + (dim * (dim - 1)) / 2;
  return f === 0 ? full : Math.max(0, full - dim - (f - 1) * (dim - 1));
}

export const gaussNewtonSolver = {
  id: "gauss-newton",
  name: "Damped Gauss-Newton (LM)",

  solve(problem, options = {}) {
    const maxIterations = options.maxIterations ?? 200;
    const tolerance = options.tolerance ?? 1e-6;
    const n = problem.n;
    const m = problem.m;
    let x = Float64Array.from(problem.x0);
    let r = problem.residuals(x);
    let cost = sq(r);
    let lambda = options.lambda ?? 1e-3;
    let iterations = 0;
    let stalled = false;

    const eqNorm = (res) => {
      let s = 0;
      for (let i = 0; i < m; i++) if (problem.terms[i].isEquality) s += res[i] * res[i];
      return Math.sqrt(s);
    };
    const hasObjective = problem.terms.some((t) => !t.isEquality);
    const satisfied = () => eqNorm(r) < tolerance && !hasObjective;

    while (n > 0 && m > 0 && iterations < maxIterations && !stalled && !satisfied()) {
      iterations++;
      const J = jacobian(problem, x);
      const { JtJ, Jtr } = normalEquations(J, r, m, n);
      let accepted = false;
      for (let attempt = 0; attempt < 12 && !accepted; attempt++) {
        const A = Float64Array.from(JtJ);
        for (let i = 0; i < n; i++) A[i * n + i] += lambda * Math.max(JtJ[i * n + i], 1e-9);
        const delta = solveLinear(A, Jtr.map((v) => -v), n);
        if (!delta) {
          lambda *= 10;
          continue;
        }
        const xn = Float64Array.from(x);
        for (let i = 0; i < n; i++) xn[i] += delta[i];
        problem.normalize(xn);
        const rn = problem.residuals(xn);
        const cn = sq(rn);
        if (cn <= cost) {
          const decrease = cost - cn;
          const stepNorm = Math.sqrt(sq(delta));
          x = xn;
          r = rn;
          cost = cn;
          lambda = Math.max(lambda / 3, 1e-12);
          accepted = true;
          if (stepNorm < 1e-10 * (1 + Math.sqrt(sq(x))) || decrease < 1e-16 * (1 + cost)) stalled = true;
        } else {
          lambda *= 4;
        }
      }
      if (!accepted) stalled = true;
    }
   // Gauge fix: an unanchored sketch is only defined up to a rigid motion.
   // Re-centre and align it so the free frame is deterministic and is not
   // mistaken for under-constraint. Residuals are invariant, but recompute
   // them anyway so the report matches the reported positions exactly.
   const gaugeFixed = typeof problem.alignFrame === "function" && problem.alignFrame(x);
   if (gaugeFixed) {
     r = problem.residuals(x);
     cost = sq(r);
   }


    const residualNorm = Math.sqrt(cost);
    const equalityNorm = eqNorm(r);
    const converged = m === 0 || n === 0 ? equalityNorm < tolerance : equalityNorm < tolerance;

    const Jfinal = n > 0 && m > 0 ? jacobian(problem, x) : new Float64Array(0);
    const rank = matrixRank(Jfinal, m, n);
    const total = Math.max(0, n - rank);
    const rigid = Math.min(rigidBodyDof(problem), total);

    problem.apply(x);

    const ms = problem.measures(x);
    const perConstraint = problem.terms.map((t, i) => {
      const target = t.isEquality ? t.targetFn(x) : null;
      const residual = t.isEquality ? ms[i] - target : null;
      return {
        id: t.constraint.id,
        type: t.constraint.type,
        measure: ms[i],
        target,
        residual,
        weighted: r[i],
        status: t.isEquality ? statusFor(residual) : "objective",
      };
    });

    return {
      solver: this.id,
      converged,
      stalled,
      overConstrained: !converged && stalled,
      underConstrained: total - rigid > 0,
     gaugeFixed: !!gaugeFixed,
      iterations,
      residualNorm,
      equalityNorm,
      objective: hasObjective ? Math.sqrt(cost - equalityNorm * equalityNorm) : 0,
      unknowns: n,
      equations: m,
      rank,
      dof: { total, rigid, real: total - rigid },
      perConstraint,
      x: Array.from(x),
    };
  },
};