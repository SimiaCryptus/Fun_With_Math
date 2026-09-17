// Time integration for the coupled-dipole Lagrangian.
//
// State: { theta: Float64Array, thetaDot: Float64Array }
// Equations of motion: I θ_ddot = τ(θ) - γ θ_dot
//
// Two integrators:
//   - 'verlet': velocity-Verlet (symplectic when γ=0) with a semi-implicit
//     damping correction.
//   - 'variational': implicit-midpoint variational integrator with Newton
//     solve on the analytic Hessian. Damping enters through discrete
//     Lagrange–d'Alembert forces so γ>0 is handled consistently.

import {torque, gradient, hessian} from './physics.js';
import {luSolve} from '../math/linalg.js';

/**
 * Velocity-Verlet step. Symplectic for the conservative system (γ=0).
 */
export function verletStep(state, pairs, params, h) {
    const {I, gamma = 0} = params;
    const n = state.theta.length;
    const th = state.theta,
        thd = state.thetaDot;

    // a_k = (τ - γ θdot) / I
    const tau0 = torque(th, pairs, n);
    const a0 = new Float64Array(n);
    for (let i = 0; i < n; i++) a0[i] = (tau0[i] - gamma * thd[i]) / I;

    const thNew = new Float64Array(n);
    for (let i = 0; i < n; i++) thNew[i] = th[i] + thd[i] * h + 0.5 * a0[i] * h * h;

    // v_{k+1} = v_k + h/2 (a0 + a1), a1 = (τ1 - γ v_{k+1})/I  (implicit in the damping term)
    //   => v_{k+1} (1 + hγ/(2I)) = v_k + h/2 a0 + h/(2I) τ1
    const tau1 = torque(thNew, pairs, n);
    const thdNew = new Float64Array(n);
    const denom = 1 + (h * gamma) / (2 * I);
    for (let i = 0; i < n; i++) {
        thdNew[i] = (thd[i] + 0.5 * h * a0[i] + (h / (2 * I)) * tau1[i]) / denom;
    }

    return {theta: thNew, thetaDot: thdNew};
}

/**
 * Implicit-midpoint variational integrator.
 * Discrete Lagrangian via midpoint quadrature:
 *   L_d(q_k, q_{k+1}) = h [ (I/2) ((q_{k+1}-q_k)/h)^2 - U((q_k+q_{k+1})/2) ]
 *
 * Damping F = -γ q̇ enters via discrete forces evaluated at the midpoint,
 *   F_d^- = F_d^+ = (h/2) F(q_mid, Δq/h) = -(γ/2) Δq,   Δq = q_{k+1} - q_k
 * giving the discrete Lagrange–d'Alembert position–momentum form
 *   p_k     = -D1 L_d - F_d^- = (I/h + γ/2) Δq + (h/2) ∇U(q_mid)
 *   p_{k+1} =  D2 L_d + F_d^+ = (I/h - γ/2) Δq - (h/2) ∇U(q_mid)
 *
 * Given (q_k, p_k) solve the first equation for q_{k+1} by Newton, then
 * evaluate the second. With γ=0 this is the classical energy-preserving
 * (to O(h²), non-secular) implicit-midpoint scheme. We carry p = I θdot.
 */
export function variationalStep(state, pairs, params, h, opts = {}) {
    const {I, gamma = 0} = params;
    const {maxIter = 30, tol = 1e-12} = opts;
    const n = state.theta.length;
    const q = state.theta;

    const p = new Float64Array(n);
    for (let i = 0; i < n; i++) p[i] = I * state.thetaDot[i];

    const a = I / h + 0.5 * gamma; // coefficient of Δq in the residual
    const q1 = Float64Array.from(q);
    for (let i = 0; i < n; i++) q1[i] += state.thetaDot[i] * h; // explicit initial guess

    const qmid = new Float64Array(n);
    const F = new Float64Array(n);
    for (let iter = 0; iter < maxIter; iter++) {
        for (let i = 0; i < n; i++) qmid[i] = 0.5 * (q[i] + q1[i]);
        const gU = gradient(qmid, pairs, n);
        let norm = 0;
        for (let i = 0; i < n; i++) {
            F[i] = a * (q1[i] - q[i]) + 0.5 * h * gU[i] - p[i];
            norm += F[i] * F[i];
        }
        if (Math.sqrt(norm) < tol) break;

        // Jacobian dF/dq1 = a·Identity + (h/4) H(qmid)
        const H = hessian(qmid, pairs, n);
        const J = new Array(n);
        for (let i = 0; i < n; i++) {
            J[i] = new Float64Array(n);
            for (let j = 0; j < n; j++) J[i][j] = 0.25 * h * H[i][j];
            J[i][i] += a;
        }
        const negF = new Float64Array(n);
        for (let i = 0; i < n; i++) negF[i] = -F[i];
        const dq = luSolve(J, negF);
        for (let i = 0; i < n; i++) q1[i] += dq[i];
    }

    for (let i = 0; i < n; i++) qmid[i] = 0.5 * (q[i] + q1[i]);
    const gU = gradient(qmid, pairs, n);
    const b = I / h - 0.5 * gamma;
    const thetaDot = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const p1 = b * (q1[i] - q[i]) - 0.5 * h * gU[i];
        thetaDot[i] = p1 / I;
    }
    return {theta: q1, thetaDot};
}

/** Dispatch by name. */
export function step(state, pairs, params, h, method = 'verlet') {
    if (method === 'variational') return variationalStep(state, pairs, params, h);
    return verletStep(state, pairs, params, h);
}