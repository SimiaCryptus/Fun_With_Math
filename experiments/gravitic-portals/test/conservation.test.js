import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, floorCeilingPortals, G } from './fixtures.js';

const H = 2;
const DPHI = G * H;

function run(world, p, steps) {
   let maxDev = 0, maxGain = -Infinity, maxFieldDev = 0;
  for (let i = 0; i < steps && p.alive; i++) {
    world.step();
    if (!p.alive) break;
    const dE = world.energy(p) - p.e0;
    maxDev = Math.max(maxDev, Math.abs(dE));
    maxGain = Math.max(maxGain, dE);
     // Seam jumps are exactly −mismatch; adding seamError back isolates the field itself.
     maxFieldDev = Math.max(maxFieldDev, Math.abs(dE + p.seamError));
  }
   return { maxDev, maxGain, maxFieldDev };
}

test('floor/ceiling loop, 10⁴ steps, no seam correction: field conserves; seam BC error small', () => {
  const world = makeWorld(floorCeilingPortals(H, 1), { energyCorrection: false });
  const p = world.addParticle([0.1, 1, 0.05], [0, -1, 0]);
   const { maxDev, maxFieldDev } = run(world, p, 10_000);
  assert.ok(p.alive);
  assert.ok(p.crossings >= 30, `crossings ${p.crossings}`);
   const perCrossing = Math.abs(p.seamError) / p.crossings;
   console.log(`max |ΔE| ${maxDev.toFixed(5)}, field-only ${maxFieldDev.toFixed(5)}, seam mismatch/crossing ${perCrossing.toExponential(2)}`);
   assert.ok(maxFieldDev < 1e-3 * DPHI, `field-only |ΔE| ${maxFieldDev}`);
   assert.ok(perCrossing < 0.01 * DPHI, `seam mismatch per crossing ${perCrossing}`);
});

test('rim-zone loop with seam correction: never gains energy', () => {
  const world = makeWorld(floorCeilingPortals(H, 1), { energyCorrection: true });
  const p = world.addParticle([0.85, 1, 0], [0, -1.5, 0]);
  const { maxGain } = run(world, p, 10_000);
  console.log(`rim-zone crossings ${p.crossings}, raw seam mismatch ${p.seamError.toFixed(4)}`);
  assert.ok(maxGain < 0.01 * DPHI, `max gain ${maxGain}`);
});

test('naive portal (no CF, no correction) shows the free-energy loop', () => {
  const world = makeWorld(floorCeilingPortals(H, 1), {
    energyCorrection: false, terms: { disks: false, gap: false },
  });
  const p = world.addParticle([0.1, 1, 0.05], [0, -1, 0]);
  for (let i = 0; i < 600; i++) world.step();
  const gain = world.energy(p) - p.e0;
  assert.ok(gain > 5 * DPHI, `naive gain ${gain}`);
});