import {LABEL} from '../core/conventions.js';

/** Human-readable explanations used by tooltips, the legend and the inspector. */

export const LABEL_SHORT = {
    [LABEL.FORBIDDEN]: 'forbidden entry',
    [LABEL.EXIT]: 'single-pass exit',
    [LABEL.COLLISION]: 'collision',
    [LABEL.CAPTURED]: 'captured until T',
    [LABEL.MULTIPASS]: 'multi-pass exit',
    [LABEL.PENDING]: 'not computed yet',
};

export const LABEL_DESC = {
    [LABEL.FORBIDDEN]: 'Forbidden: the entry point lies inside the forbidden region for this C (2Ω − C < 0), so no real velocity exists there.',
    [LABEL.EXIT]: 'Exit: single-pass encounter. The trajectory leaves ρ and reaches ρ_far without re-entering ρ.',
    [LABEL.COLLISION]: 'Collision: the trajectory hits the surface of P2 (r₂ ≤ R_body) or comes within 10⁻³ of P1.',
    [LABEL.CAPTURED]: 'Captured: no escape to ρ_far within the time limit T (temporary capture or long transit).',
    [LABEL.MULTIPASS]: 'Multi-pass: exits only after re-entering the ρ circle one or more times. The recorded exit is the last ρ crossing.',
    [LABEL.PENDING]: 'Pending: this sample has not been computed yet.',
};

export const SIG_DESC = [
    {short: '(+,+)', long: 'Hessian of ΔE positive definite: ΔE is locally bowl-shaped (minimum-like) in (α, β).'},
    {short: '(−,−)', long: 'Hessian of ΔE negative definite: ΔE is locally cap-shaped (maximum-like) in (α, β).'},
    {short: '(+,−)', long: 'Indefinite Hessian: ΔE is locally saddle-shaped.'},
    {short: 'degenerate', long: 'det H ≈ 0: a fold or crease of the ΔE landscape (curvature vanishes in one direction).'},
];

export const PRESET_DESC = {
    l1closed: 'C slightly above C_L1: the zero-velocity curve seals the region around P2. No transport through L1.',
    l1open: 'C midway between C_L1 and C_L2: the L1 neck is open, connecting the P1 and P2 regions. L2 is still closed.',
    l2open: 'C between C_L2 and C_L3: the L1 and L2 necks are both open, so trajectories can reach the exterior region.',
    l3open: 'C slightly below C_L3: all three collinear necks are open. Only the regions around L4/L5 remain forbidden.',
};

const A_DESC = 'Entry of A = ∂v_I,out/∂v_I,in at fixed entry position: the linearized map from incoming to outgoing inertial velocity (includes the time-of-flight rotation).';

export const FIELD_DESC = {
    dE: 'ΔE: change of the inertial (barycentric) energy E = ½|v_I|² − (1−μ)/r₁ − μ/r₂ across the encounter. Positive = energy gained (slingshot).',
    dH: 'Δh: change of the inertial angular momentum h = xẏ − yẋ + x² + y² about the barycentre.',
    errEH: '|ΔE − Δh|: should vanish because the Jacobi constant is conserved. This is an integration-error diagnostic.',
    dE1: 'ΔE₁: change of the Keplerian energy relative to P1 alone.',
    dvx: 'Δv_I,x: inertial velocity change, x-component (axes of the entry instant).',
    dvy: 'Δv_I,y: inertial velocity change, y-component (axes of the entry instant).',
    dvRx: 'Δv_R,x: rotating-frame velocity change, x-component.',
    dvRy: 'Δv_R,y: rotating-frame velocity change, y-component.',
    A00: A_DESC, A01: A_DESC, A10: A_DESC, A11: A_DESC,
    bx: 'b_x: affine offset of the velocity map, b = v_out − A·v_in.',
    by: 'b_y: affine offset of the velocity map, b = v_out − A·v_in.',
    deltaEff: 'δ_eff: effective deflection angle, the rotation part Q of the polar decomposition A = Q·S.',
    s1: 's₁: larger principal stretch of A (eigenvalue of S in A = Q·S).',
    s2: 's₂: smaller principal stretch of A.',
    flip: 'flip = 1 if det A ≤ 0 (orientation-reversing velocity map, typically near folds).',
    tau: 'τ: physical time of flight from entry on Σ_in to the last crossing of ρ.',
    rPeri: 'r_peri: closest approach to P2 during the encounter.',
    ftle: 'FTLE: finite-time Lyapunov exponent of the map (α, β) → exit state, with positions scaled by ρ and velocities by the circular speed √(μ/ρ).',
    kappaE: 'κ_E: |∇ΔE|² / tr(g), the sensitivity of ΔE relative to the overall stretching of the exit state.',
    gA: '∂ΔE/∂α: analytic derivative of ΔE with respect to the entry position angle (via the STM).',
    gB: '∂ΔE/∂β: analytic derivative of ΔE with respect to the entry velocity angle (via the STM).',
    alphaOut: 'α_out: exit position angle on the ρ circle.',
    betaOut: 'β_out: exit velocity angle measured from the outward normal.',
    jacobiDrift: '|C_exit − C|: drift of the Jacobi constant at exit. This is an integration-accuracy diagnostic.',
    nPasses: 'Number of passes inside ρ (1 = single encounter).',
    H00: 'H_αα: Hessian of ΔE, from centred differences of ∇ΔE on the grid.',
    H01: 'H_αβ: Hessian of ΔE, from centred differences of ∇ΔE on the grid (symmetrized).',
    H11: 'H_ββ: Hessian of ΔE, from centred differences of ∇ΔE on the grid.',
    detH: 'det H: determinant of the ΔE Hessian. The sign separates extremum-like from saddle-like regions.',
    sig: 'Signature class: 0 = (+,+), 1 = (−,−), 2 = (+,−) saddle, 3 = degenerate.',
    asym: '|∂_β g_α − ∂_α g_β|: asymmetry of the finite-difference Hessian. A large value means the grid under-resolves ΔE here.',
};