/**
 * Single source of truth for the conventions (plan.md §1).
 *
 * C1  The encounter circle Σ has radius ρ about a centre c = (cx, 0), which is P2 (default),
 *     P1 or the barycentre. With r̂ = (cos α, sin α) measured from c:
 *     n̂ = −r̂ is the inward normal and t̂ = ẑ × r̂ = (−sin α, cos α).
 *     v_R = |v_R| (cos β n̂ + sin β t̂).
 *     NOTE: plan.md wrote t̂ = ẑ × n̂, but that gives NEGATIVE angular momentum
 *     about the centre for β > 0, which contradicts the plan's own test. We use ẑ × r̂,
 *     so β > 0 ⇒ prograde (tested).
 * C2  Multi-pass: an outer radius ρ_far = kρ. Re-entry through ρ before reaching
 *     ρ_far increments the pass count; the recorded exit is the last ρ crossing.
 * C4  Entry instant ≡ inertial/rotating coincidence. The exit inertial velocity
 *     is expressed in the entry axes: v_I,out = R(+τ)·(ẋ−y, ẏ+x)_out.
 * C5  A = ∂v_I,out/∂v_I,in at fixed entry position, including the ∂τ/∂v term
 *     from the R(τ) rotation (missing in plan.md C5).
 * C7  α nodes: α_i = 2πi/N. β cell centres: β_j = −π/2 + (j+½)π/N.
 *     These nest exactly when N is multiplied by an odd factor (refinement uses ×3).
 * Regularization: a smooth Sundman time transform dt/ds = g(r1, r2), with
 *     g = r1/(r1+ε1) · r2/(r2+ε2). The STM stays in physical coordinates.
 */
export const CORE_VERSION = 3;

export const LABEL = Object.freeze({
    FORBIDDEN: 0, EXIT: 1, COLLISION: 2, CAPTURED: 3, MULTIPASS: 4, PENDING: 255,
});

export const hillRadius = (mu) => Math.cbrt(mu / 3);
export const isExitLabel = (l) => l === LABEL.EXIT || l === LABEL.MULTIPASS;

/** Centre of the encounter circle: x-position cx and the mass m attracting at that centre (for patched conics). */
export function centerOf(center, mu) {
    if (center === 'primary') return {cx: -mu, m: 1 - mu};
    if (center === 'barycentre') return {cx: 0, m: 1};
    return {cx: 1 - mu, m: mu};
}