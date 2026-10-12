/**
 * Spaceship mode.
 *
 * The ship's current trajectory (from state s0) is the basis. A burn manifold sample (x, θ) means:
 *   t = x/(2π) · span along the basis path, apply an instantaneous impulse of magnitude |Δv|
 *   in direction θ measured from the local rotating-frame velocity (θ = 0 prograde, +90° to the left),
 *   then coast for the horizon T (physical time, g ≡ 1 so the STM is the exact fixed-time STM).
 */
import {hillRadius, LABEL} from './conventions.js';
import {jacobi, rhs4} from './cr3bp.js';
import {Dopri5, integrateTo, stepFactor} from './dopri5.js';
import {makeAugRhs} from './variational.js';
import {approachTracker} from './approach.js';

const TWO_PI = 2 * Math.PI;

export const bodyRadii = (p) => ({R1: Math.max(p.R1 ?? 1e-3, 1e-5), R2: Math.max(p.Rbody, 1e-7)});

function hitsBody(v, mu, R1, R2) {
    return Math.hypot(v[0] - 1 + mu, v[1]) <= R2 || Math.hypot(v[0] + mu, v[1]) <= R1;
}

/** Prograde circular two-body orbit about P1 or P2 at radius r, expressed in the rotating frame. */
export function circularOrbit(mu, body, r) {
    if (body === 'P2') return [1 - mu + r, 0, 0, Math.sqrt(mu / r) - r];
    return [-mu + r, 0, 0, Math.sqrt((1 - mu) / r) - r];
}

export const SHIP_PRESETS = {
    p2orbit: {name: 'Circular orbit about P2 (0.4 r_H)', make: (mu) => circularOrbit(mu, 'P2', 0.4 * hillRadius(mu))},
    p1low: {name: 'Circular orbit about P1 (r = 0.3)', make: (mu) => circularOrbit(mu, 'P1', 0.3)},
    p1cross: {name: 'P1 orbit grazing the Hill sphere of P2', make: (mu) => circularOrbit(mu, 'P1', 1 - 1.5 * hillRadius(mu))},
    p1outer: {name: 'P1 orbit just outside P2', make: (mu) => circularOrbit(mu, 'P1', 1 + 1.5 * hillRadius(mu))},
};

/**
 * Apply the impulse to the basis state sb. Returns the post-burn state and ∂s_post/∂(x, θ) (4×2 row-major),
 * where x = 2π t / span (xScale = dt/dx = span / 2π).
 */
export function applyImpulse(sb, theta, dv, mu, xScale = 1) {
    const f = rhs4(sb, mu);
    const vx = sb[2], vy = sb[3], v = Math.hypot(vx, vy);
    let ux = 1, uy = 0, dux = 0, duy = 0;
    if (v > 1e-12) {
        ux = vx / v;
        uy = vy / v;
        const ua = ux * f[2] + uy * f[3];
        dux = (f[2] - ux * ua) / v;
        duy = (f[3] - uy * ua) / v;
    }
    // Δv = |Δv| (cos θ û + sin θ n̂), n̂ = ẑ × û = (−uy, ux)
    const c = Math.cos(theta), s = Math.sin(theta);
    const dvx = dv * (c * ux - s * uy), dvy = dv * (c * uy + s * ux);
    const dtx = dv * (c * dux - s * duy), dty = dv * (c * duy + s * dux);
    const dthx = dv * (-s * ux - c * uy), dthy = dv * (-s * uy + c * ux);
    const sPost = [sb[0], sb[1], vx + dvx, vy + dvy];
    const J = new Float64Array(8);
    J[0] = f[0] * xScale;
    J[2] = f[1] * xScale;
    J[4] = (f[2] + dtx) * xScale;
    J[6] = (f[3] + dty) * xScale;
    J[5] = dthx;
    J[7] = dthy;
    return {sPost, sJac: J, dv: [dvx, dvy]};
}

/** Walks the basis path forward in physical time. at(t) must be called with non-decreasing t. */
export class BasisWalker {
    constructor(s0, p) {
        this.mu = p.mu;
        const {R1, R2} = bodyRadii(p);
        this.R1 = R1;
        this.R2 = R2;
        this.integ = new Dopri5(21, makeAugRhs(p.mu, {withSTM: false}), {
            rtol: p.rtol ?? 1e-12, atol: p.atol ?? 1e-12, nerr: 4,
        });
        this.y = new Float64Array(21);
        this.y.set(Array.from(s0).slice(0, 4));
        this.t = 0;
        this.dead = hitsBody(this.y, this.mu, R1, R2);
    }

    at(t) {
        if (this.dead) return null;
        if (t > this.t) {
            try {
                integrateTo(this.integ, this.y, t - this.t);
            } catch {
                this.dead = true;
                return null;
            }
            this.t = t;
            if (hitsBody(this.y, this.mu, this.R1, this.R2)) {
                this.dead = true;
                return null;
            }
        }
        return [this.y[0], this.y[1], this.y[2], this.y[3]];
    }
}

/** Polyline of the basis path over [0, span] (stops at a collision). times (optional array) receives the sample times. */
export function shipPath(s0, p, n = 800, times = null) {
    const w = new BasisWalker(s0, p), pts = [s0[0], s0[1]];
    if (times) times.push(0);
    for (let q = 1; q <= n; q++) {
        const t = (q * p.ship.span) / n, s = w.at(t);
        if (!s) break;
        pts.push(s[0], s[1]);
        if (times) times.push(t);
    }
    return pts;
}

/** Burn at basis state sb in direction θ, then coast for the horizon p.T. */
export function propagateShip(sb, theta, p, {withSTM = true, record = false, maxSteps = 200000} = {}) {
    const mu = p.mu, rho = p.rho, T = p.T, cx = p.cx ?? 1 - mu;
    const {R1, R2} = bodyRadii(p);
    const {sPost, sJac} = applyImpulse(sb, theta, p.ship.dv, mu, p.ship.span / TWO_PI);
    const rcOf = (v) => Math.hypot(v[0] - cx, v[1]);
    const near = approachTracker(mu);
    near.update(sPost);
    const res = {
        alpha: null, beta: theta, sBurn: sb, sIn: sPost, sJac, fixedTime: true, C: jacobi(sPost, mu),
        label: LABEL.COLLISION, exitY: null, rPeri: rcOf(sPost), nPasses: 0,
        traj: record ? [sPost[0], sPost[1]] : null,
        trajT: record ? [0] : null, near: near.result(),
    };
    if (hitsBody(sPost, mu, R1, R2)) return res;
    const rhs = makeAugRhs(mu, {withSTM});
    const integ = new Dopri5(21, rhs, {rtol: p.rtol ?? 1e-12, atol: p.atol ?? 1e-12, nerr: 4});
    const y = new Float64Array(21), yn = new Float64Array(21);
    y.set(sPost);
    if (withSTM) y[4] = y[9] = y[14] = y[19] = 1;
    rhs(y, integ.k1);
    let h = 1e-3, passes = res.rPeri < rho ? 1 : 0, label = null, exitY = null;
    for (let step = 0; step < maxSteps; step++) {
        const last = y[20] + h >= T, hh = last ? T - y[20] : h;
        const err = integ.attempt(y, hh, yn);
        if (err <= 1) {
            if (record) {
                res.traj.push(yn[0], yn[1]);
                res.trajT.push(yn[20]);
            }
            near.update(yn);
            if (hitsBody(yn, mu, R1, R2)) {
                label = LABEL.COLLISION;
                break;
            }
            const ra = rcOf(y), rb = rcOf(yn);
            if (rb < res.rPeri) res.rPeri = rb;
            if (ra >= rho && rb < rho) passes++;
            y.set(yn);
            integ.k1.set(integ.k7);
            if (last) {
                exitY = Float64Array.from(y);
                label = passes ? LABEL.MULTIPASS : LABEL.EXIT;
                break;
            }
        }
        h = hh * stepFactor(err);
        if (h < 1e-14) break;
    }
    res.label = label ?? LABEL.CAPTURED;
    res.exitY = res.label === LABEL.EXIT || res.label === LABEL.MULTIPASS ? exitY : null;
    res.nPasses = passes;
    res.near = near.result();
    return res;
}