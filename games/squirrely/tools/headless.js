#!/usr/bin/env node
// Headless metrics runner (SPEC §19.4): node tools/headless.js --level l04 --seeds 20 --seconds 60 [--json]
import { TUNING } from '../src/data/tuning.js';
import { DRIVERS } from '../src/data/drivers.js';
import { LEVELS, endlessLevel } from '../src/data/levels.js';
import { EventBus } from '../src/core/events.js';
import { createDriverRegistry } from '../src/sim/drivers/index.js';
import { World, EMPTY_INTENT } from '../src/sim/world.js';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1]; if (v && !v.startsWith('--')) { args[k] = v; i++; } else args[k] = true; }
}
const levelId = args.level ?? 'l04', seeds = Number(args.seeds ?? 20), seconds = Number(args.seconds ?? 60);
const level = levelId.startsWith('endless-') ? endlessLevel(Number(levelId.split('-')[1])) : LEVELS.find((l) => l.id === levelId);
if (!level) { console.error(`unknown level '${levelId}'`); process.exit(1); }

const SAMPLE = 12;   // every 0.1 s
const acc = { crashes: 0, bumps: 0, swerves: 0, locks: 0, vehSamples: 0, samples: 0, duty: level.rows.filter((r) => r.type === 'lane').map(() => 0) };
const t0 = Date.now();

for (let seed = 1; seed <= seeds; seed++) {
  const world = new World({ level, drivers: createDriverRegistry(DRIVERS, level.modifiers), tuning: TUNING, seed, events: new EventBus() });
  const n = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < n; i++) {
    world.step(TUNING.dt, EMPTY_INTENT);
    if (i % SAMPLE) continue;
    acc.samples++; acc.vehSamples += world.vehicles.length;
    world.road.lanes.forEach((lane, li) => {
      let open = true;
      for (const v of world.vehicles) {
        if (v.lane !== lane && v.lcFrom !== lane) continue;
        if (Math.abs(v.x) < v.length * 0.5 + 1) { open = false; break; }
        const ahead = lane.dir * (0 - v.x);
        if (ahead > 0 && ahead / Math.max(v.speed, 0.1) < 1.2) { open = false; break; }   // arrives within 1.2 s
      }
      if (open) acc.duty[li]++;
    });
  }
  acc.crashes += world.stats.crashes; acc.bumps += world.stats.bumps; acc.swerves += world.stats.swerves; acc.locks += world.stats.locks;
}

const minutes = (seeds * seconds) / 60;
const report = {
  level: level.id, seeds, seconds,
  crashesPerMin: +(acc.crashes / minutes).toFixed(2),
  bumpsPerMin: +(acc.bumps / minutes).toFixed(2),
  swervesPerMin: +(acc.swerves / minutes).toFixed(2),
  locksPerMin: +(acc.locks / minutes).toFixed(2),
  meanVehicles: +(acc.vehSamples / acc.samples).toFixed(1),
  gapDutyCyclePerLane: acc.duty.map((d) => +(d / acc.samples).toFixed(3)),
  wallSeconds: +((Date.now() - t0) / 1000).toFixed(1),
};

if (args.json) console.log(JSON.stringify(report));
else {
  console.log(`Level ${report.level} — ${seeds} seeds × ${seconds} s (${report.wallSeconds} s wall)`);
  console.log(`  crashes/min ${report.crashesPerMin}   bumps/min ${report.bumpsPerMin}   swerves/min ${report.swervesPerMin}   locks/min ${report.locksPerMin}`);
  console.log(`  mean vehicles ${report.meanVehicles}`);
  console.log(`  gap duty cycle per lane: ${report.gapDutyCyclePerLane.join('  ')}`);
}