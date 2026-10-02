// Integration scenarios for the full step pipeline (§A.9, §B.7).
// Pending: world.js, clusters.js, rigid.js, topology.js, contacts.js, stress.js and gravity/
// are not implemented yet. The earlier draft of this file targeted an API
// (`new World`, `w.vox`, `w.bonds`, math `add/sub/len`) that does not match §B.5 and failed at
// import time. Convert each todo to a real test against createWorld/step/measure/hashState as
// the modules land (see §B.8 implementation order).
import test from 'node:test';

test.todo('conservation: two-body orbit conserves P (1e-9) and L (1e-6) in 𝓘');
test.todo('conservation: split conserves P and L exactly (1e-12)');
test.todo('conservation: merge conserves P and L exactly; lost KE booked as heat');
test.todo('gravity: uniform sphere outside field within 1% of GM/r² (≥ 2 cells from surface)');
test.todo('gravity: zero net self-force of a deposit (1e-10 relative)');
test.todo('gravity: body-attached sampling rotates exactly under 90° source rotation');
test.todo('rigid: Ω = 0 vs Ω ≠ 0 torque-free body agree in 𝓘 (1e-9)');
test.todo('rigid: Dzhanibekov flip for intermediate-axis spin of a 6×3×1 slab');
test.todo('frame: free particle in 𝓕 mapped to 𝓘 via q_f is a straight line');
test.todo('frame: re-basing mid-run does not change 𝓘 trajectories (1e-12)');
test.todo('structure: Big Rocket 50 kN tears a regolith mount within 1 s');
test.todo('structure: same engine on a CMP block holds for 60 s');
test.todo('determinism: two runs with same seed/inputs give identical hashState at tick 1e4');