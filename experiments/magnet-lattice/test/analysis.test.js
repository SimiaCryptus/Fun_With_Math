import {describe, it, assert, assertClose} from './harness.js';
import {buildPairs, gradient} from '../src/model/physics.js';
import {
     relax,
     analyze,
     latticeSymmetries,
     statesEquivalent,
     MinimaSweep,
} from '../src/model/analysis.js';
import {jacobiEigen, luSolve} from '../src/math/linalg.js';

const params = {k: 1.0, m: 1.0, I: 1.0};
const pos = [
    [0, 0],
    [1, 0],
];

describe('linalg: luSolve', () => {
    it('solves a 3x3 system', () => {
        const A = [
            new Float64Array([2, 1, 1]),
            new Float64Array([1, 3, 2]),
            new Float64Array([1, 0, 0]),
        ];
        const b = new Float64Array([4, 5, 6]);
        const x = luSolve(A, b);
        for (let i = 0; i < 3; i++) {
            let s = 0;
            for (let j = 0; j < 3; j++) s += A[i][j] * x[j];
            assertClose(s, b[i], 1e-10, `row ${i}`);
        }
    });

    it('throws on singular matrix', () => {
        const A = [new Float64Array([1, 2]), new Float64Array([2, 4])];
        let threw = false;
        try {
            luSolve(A, new Float64Array([1, 1]));
        } catch {
            threw = true;
        }
        assert(threw, 'expected singular-matrix error');
    });
});

describe('linalg: jacobiEigen', () => {
    it('diagonal matrix eigenvalues', () => {
        const A = [
            new Float64Array([3, 0, 0]),
            new Float64Array([0, 1, 0]),
            new Float64Array([0, 0, 2]),
        ];
        const {values} = jacobiEigen(A);
        assertClose(values[0], 1, 1e-10);
        assertClose(values[1], 2, 1e-10);
        assertClose(values[2], 3, 1e-10);
    });

    it('known 2x2 symmetric matrix', () => {
        const A = [new Float64Array([2, 1]), new Float64Array([1, 2])];
        const {values, vectors} = jacobiEigen(A);
        assertClose(values[0], 1, 1e-10);
        assertClose(values[1], 3, 1e-10);
        for (let k = 0; k < 2; k++) {
            const v = vectors[k];
            for (let i = 0; i < 2; i++) {
                let s = 0;
                for (let j = 0; j < 2; j++) s += A[i][j] * v[j];
                assertClose(s, values[k] * v[i], 1e-9, `Av=λv k=${k} i=${i}`);
            }
        }
    });
});

describe('analysis: 2-magnet equilibrium & modes', () => {
    it('relax finds the aligned ground state to near machine precision', () => {
        const pairs = buildPairs(pos, params);
        const {theta, gradNorm} = relax(new Float64Array([0.5, -0.3]), pairs, 2);
        assert(gradNorm < 1e-9, `gradNorm ${gradNorm}`);
        const g = gradient(theta, pairs, 2);
        assertClose(g[0], 0, 1e-9);
        assertClose(g[1], 0, 1e-9);
        // both along ±x, and parallel to each other
        assertClose(Math.abs(Math.sin(theta[0])), 0, 1e-8, 'θ0 on x-axis');
        assertClose(Math.abs(Math.sin(theta[1])), 0, 1e-8, 'θ1 on x-axis');
        assertClose(Math.cos(theta[0] - theta[1]), 1, 1e-8, 'parallel');
    });

    it('normal modes match closed form ω = 1 (anti-symmetric) and √3 (symmetric)', () => {
        const pairs = buildPairs(pos, params);
        const {theta} = relax(new Float64Array([0.1, -0.1]), pairs, 2);
        const res = analyze(theta, pairs, 2, params);
        assertClose(res.omega[0], 1, 1e-6, 'ω0');
        assertClose(res.omega[1], Math.sqrt(3), 1e-6, 'ω1');
        // mode shapes: eigenvalue 1 -> (1,-1)/√2 ; eigenvalue 3 -> (1,1)/√2
        const v0 = res.modes[0],
            v1 = res.modes[1];
        assertClose(Math.abs(v0[0] * v0[1] * 2), 1, 1e-6, 'mode0 anti-symmetric');
        assert(v0[0] * v0[1] < 0, 'mode0 components have opposite sign');
        assert(v1[0] * v1[1] > 0, 'mode1 components have same sign');
        // normalized coupling
        assertClose(res.C[0][0], 1, 1e-12);
        assertClose(res.C[0][1], 0.5, 1e-9);
    });

    it('flags the anti-aligned (head-to-head) configuration as unstable', () => {
        const pairs = buildPairs(pos, params);
        const res = analyze(new Float64Array([0, Math.PI]), pairs, 2, params);
        assert(res.values[0] < 0, `expected a negative eigenvalue, got ${res.values[0]}`);
        assert(res.omega[0] < 0, 'omega sign should flag instability');
    });
});
describe('analysis: lattice symmetries & stable-state sweep', () => {
     it('a 2-magnet row keeps the 4 D4 operations that preserve it', () => {
         const ops = latticeSymmetries(pos);
         const names = ops.map((o) => o.name).sort();
         assert(names.join(',') === 'e,mx,my,r180', `got ${names}`);
         const r180 = ops.find((o) => o.name === 'r180');
         assert(r180.perm[0] === 1 && r180.perm[1] === 0, 'r180 swaps the two magnets');
     });
     it('a 2x2 square keeps all 8 operations', () => {
         const sq = [
             [0, 0],
             [1, 0],
             [0, 1],
             [1, 1],
         ];
         assert(latticeSymmetries(sq).length === 8);
     });
     it('treats flipped / mirrored / rotated states as equivalent', () => {
         const ops = latticeSymmetries(pos);
         const eq = (a, b) => statesEquivalent(Float64Array.from(a), Float64Array.from(b), ops);
         assert(eq([0, 0], [Math.PI, Math.PI]), 'global flip');
         assert(eq([0.3, -0.3], [-0.3, 0.3]), 'mirror across the row axis');
         assert(eq([0.3, 0.7], [Math.PI + 0.7, Math.PI + 0.3]), 'rotation by 180° swaps & rotates');
         assert(!eq([0, 0], [0, Math.PI]), 'head-to-head is a different state');
     });
     it('sweep catalogs exactly one stable state for two magnets (U = -2)', () => {
         const pairs = buildPairs(pos, params);
         const sw = new MinimaSweep(pos, pairs, 2, {starts: 40});
         while (!sw.runFor(1000));
         assert(sw.done === 40);
         assert(sw.catalog.length === 1, `expected 1 state, got ${sw.catalog.length}`);
         const e = sw.catalog[0];
         assertClose(e.energy, -2, 1e-8, 'ground-state energy');
         assert(e.lambdaMin > 0.5, `should be stiff, λmin=${e.lambdaMin}`);
         assert(e.tags.includes('ferromagnetic (all aligned)'), `tags ${e.tags}`);
         assert(e.orbit === 2, `orbit {(0,0),(π,π)} expected 2, got ${e.orbit}`);
         assert(e.hits + sw.saddles + sw.unconverged === 40, 'every start is accounted for');
     });
     it('sweep entries are stable and pairwise non-equivalent (2x2 square)', () => {
         const sq = [
             [0, 0],
             [1, 0],
             [0, 1],
             [1, 1],
         ];
         const pairs = buildPairs(sq, params);
         const sw = new MinimaSweep(sq, pairs, 4, {starts: 60});
         while (!sw.runFor(1000));
         const cat = sw.catalog;
         assert(cat.length >= 1, 'found at least one minimum');
         for (let a = 0; a < cat.length; a++) {
             assert(cat[a].lambdaMin >= -1e-7, `entry ${a} not stable`);
             assert(cat[a].id === a + 1, 'ids follow energy order');
             if (a > 0) assert(cat[a].energy >= cat[a - 1].energy, 'sorted by energy');
             for (let b = a + 1; b < cat.length; b++) {
                 assert(!statesEquivalent(cat[a].theta, cat[b].theta, sw.ops), `entries ${a},${b} duplicate`);
             }
         }
     });
});