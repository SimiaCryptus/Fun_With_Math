import {describe, it, assert, assertClose} from './harness.js';
import {buildPairs, energy, kinetic} from '../src/model/physics.js';
import {step} from '../src/model/integrator.js';

const params = {k: 1.0, m: 1.0, I: 1.0, gamma: 0.0};

// Two magnets one grid cell apart: coeff = 1, aligned-state modes ω = 1 and √3.
const pos = [
    [0, 0],
    [1, 0],
];

function totalEnergy(state, pairs, p = params) {
    return kinetic(state.thetaDot, p.I) + energy(state.theta, pairs);
}

function runEnergyTest(method, steps, h) {
    const pairs = buildPairs(pos, params);
    let state = {theta: new Float64Array([0.3, -0.2]), thetaDot: new Float64Array([0, 0])};
    const E0 = totalEnergy(state, pairs);
    let maxDev = 0,
        maxDevFirstHalf = 0;
    for (let s = 0; s < steps; s++) {
        state = step(state, pairs, params, h, method);
        const dev = Math.abs((totalEnergy(state, pairs) - E0) / E0);
        maxDev = Math.max(maxDev, dev);
        if (s < steps / 2) maxDevFirstHalf = Math.max(maxDevFirstHalf, dev);
    }
    return {maxDev, maxDevFirstHalf};
}

describe('integrator: symplectic energy conservation', () => {
    for (const method of ['verlet', 'variational']) {
        it(`${method}: drift bounded and non-secular over 20000 steps`, () => {
            const {maxDev, maxDevFirstHalf} = runEnergyTest(method, 20000, 0.01);
            assert(maxDev < 1e-3, `${method} maxDev ${maxDev}`);
            // bounded oscillation: the second half must not exceed the first half's envelope
            assert(
                maxDev <= 2 * maxDevFirstHalf + 1e-12,
                `${method} secular drift: full ${maxDev} vs first-half ${maxDevFirstHalf}`,
            );
        });

        it(`${method}: energy error scales as O(h²)`, () => {
            const coarse = runEnergyTest(method, 4000, 0.02).maxDev;
            const fine = runEnergyTest(method, 8000, 0.01).maxDev;
            assert(fine < 0.5 * coarse, `${method} h/2 error ${fine} vs ${coarse}`);
        });
    }
});

describe('integrator: damping dissipates energy', () => {
    for (const method of ['verlet', 'variational']) {
        it(`${method}: settles into the U=-2 aligned minimum with gamma>0`, () => {
            const dparams = {...params, gamma: 0.5};
            const pairs = buildPairs(pos, dparams);
            let state = {theta: new Float64Array([1.0, -0.5]), thetaDot: new Float64Array([0, 0])};
            const E0 = totalEnergy(state, pairs, dparams);
            let prev = E0;
            let increases = 0;
            for (let s = 0; s < 5000; s++) {
                state = step(state, pairs, dparams, 0.01, method);
                const E = totalEnergy(state, pairs, dparams);
                if (E > prev + 1e-12) increases++;
                prev = E;
            }
            const Ef = totalEnergy(state, pairs, dparams);
            assert(Ef < E0, `final ${Ef} should be < initial ${E0}`);
            assert(increases === 0, `energy increased on ${increases} steps`);
            assertClose(Ef, -2, 1e-4, 'settled energy');
        });
    }
});