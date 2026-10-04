// Integration scenarios for the full step pipeline (§A.9, §B.7).
// Implemented: math, rng, hash, params, materials, voxels, frame, clusters, rigid, particles
// (free flight), ledger (K/P/L), world (frame + rigid pipeline). See frame/clusters/rigid tests.
// Pending: faces.js, topology.js, contacts.js, stress.js, gravity/, thermal.js. Convert each
// todo to a real test against createWorld/step/measure/hashState as the modules land (§B.8).
import test from 'node:test';

test.todo('conservation: two-body orbit conserves P (1e-9) and L (1e-6) in 𝓘');
test.todo('conservation: split conserves P and L exactly (1e-12)');
test.todo('conservation: merge conserves P and L exactly; lost KE booked as heat');
test.todo('gravity: uniform sphere outside field within 1% of GM/r² (≥ 2 cells from surface)');
test.todo('gravity: zero net self-force of a deposit (1e-10 relative)');
test.todo('gravity: body-attached sampling rotates exactly under 90° source rotation');
test.todo('structure: Big Rocket 50 kN tears a regolith mount within 1 s');
test.todo('structure: same engine on a CMP block holds for 60 s');
test.todo('determinism: two runs with same seed/inputs give identical hashState at tick 1e4');