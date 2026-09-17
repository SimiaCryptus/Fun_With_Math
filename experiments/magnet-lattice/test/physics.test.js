import {describe, it, assert, assertClose} from './harness.js';
import {
    buildPairs,
    energy,
    gradient,
    hessian,
    gradientFD,
    hessianFD,
} from '../src/model/physics.js';

// Physics runs in grid-cell units: unit spacing => coeff = k m² / r³ = 1 for neighbours.
const params = {k: 1.0, m: 1.0};

function randTheta(n) {
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = (Math.random() - 0.5) * 2 * Math.PI;
    return t;
}

describe('physics: pair coefficients', () => {
    it('nearest neighbours couple with k m² and fall off as 1/r³', () => {
        const pairs = buildPairs(
            [
                [0, 0],
                [1, 0],
                [3, 0],
            ],
            {k: 2, m: 1.5},
        );
        assertClose(pairs[0].coeff, 2 * 1.5 * 1.5, 1e-12, 'r=1');
        assertClose(pairs[1].coeff, (2 * 1.5 * 1.5) / 27, 1e-12, 'r=3');
        assertClose(pairs[2].coeff, (2 * 1.5 * 1.5) / 8, 1e-12, 'r=2');
    });
});

describe('physics: analytic gradient vs finite-difference', () => {
    it('matches for random 4-magnet config', () => {
        const pos = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ];
        const pairs = buildPairs(pos, params);
        const n = pos.length;
        for (let trial = 0; trial < 5; trial++) {
            const theta = randTheta(n);
            const g = gradient(theta, pairs, n);
            const gfd = gradientFD(theta, pairs, n);
            for (let i = 0; i < n; i++) assertClose(g[i], gfd[i], 1e-6, `grad[${i}]`);
        }
    });
});

describe('physics: analytic Hessian vs finite-difference', () => {
    const pos = [
        [0, 0],
        [1, 0],
        [0.5, 0.8],
    ];

    it('matches for random 3-magnet config', () => {
        const pairs = buildPairs(pos, params);
        const n = pos.length;
        const theta = randTheta(n);
        const H = hessian(theta, pairs, n);
        const Hfd = hessianFD(theta, pairs, n);
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) assertClose(H[i][j], Hfd[i][j], 1e-6, `H[${i}][${j}]`);
    });

    it('is symmetric', () => {
        const pairs = buildPairs(pos, params);
        const n = pos.length;
        const H = hessian(randTheta(n), pairs, n);
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) assertClose(H[i][j], H[j][i], 1e-12, 'symmetry');
    });
});

describe('physics: 2-magnet ground state', () => {
    const pos = [
        [0, 0],
        [1, 0],
    ];

    it('head-to-tail alignment along the axis is a stationary minimum', () => {
        const pairs = buildPairs(pos, params);
        const aligned = new Float64Array([0, 0]);
        const g = gradient(aligned, pairs, 2);
        assertClose(g[0], 0, 1e-12, 'grad0 at aligned');
        assertClose(g[1], 0, 1e-12, 'grad1 at aligned');
        // U = coeff [cos 0 - 3 cos 0 cos 0] = -2
        assertClose(energy(aligned, pairs), -2, 1e-12, 'U aligned');
        const perp = new Float64Array([Math.PI / 2, Math.PI / 2]);
        assertClose(energy(perp, pairs), 1, 1e-12, 'U perpendicular-parallel');
        assert(energy(aligned, pairs) < energy(perp, pairs), 'aligned should be lower');
    });

    it('Hessian at the aligned state is [[2,1],[1,2]]', () => {
        const pairs = buildPairs(pos, params);
        const H = hessian(new Float64Array([0, 0]), pairs, 2);
        assertClose(H[0][0], 2, 1e-12);
        assertClose(H[1][1], 2, 1e-12);
        assertClose(H[0][1], 1, 1e-12);
        assertClose(H[1][0], 1, 1e-12);
    });
});