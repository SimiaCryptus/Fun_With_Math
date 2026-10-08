#!/usr/bin/env node
// Headless scenario runner.
//   node test/run-scenario.js levels/floor-ceiling.json --steps 2000 --out out.csv [--every 10]
// With no arguments it prints usage and exits 0 (node --test picks up files in test/).
import fs from 'node:fs';
import { createWorldFromLevel } from '../src/core/level.js';

const args = process.argv.slice(2);
const levelPath = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

if (!levelPath) {
  console.log('usage: node test/run-scenario.js <level.json> [--steps N] [--out file.csv] [--every K]');
} else {
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const steps = Number(opt('steps', 2000));
  const every = Number(opt('every', 10));
  const out = opt('out', null);
  const { world, emitter } = createWorldFromLevel(level);
  const lines = ['step,t,id,x,y,z,vx,vy,vz,E,dE,crossings'];
  for (let s = 0; s <= steps; s++) {
    if (s % every === 0) {
      for (const p of world.particles) {
        const E = world.energy(p);
        lines.push([world.stepCount, world.time.toFixed(6), p.id, p.pos.x, p.pos.y, p.pos.z,
          p.vel.x, p.vel.y, p.vel.z, E, E - p.e0, p.crossings].join(','));
      }
    }
    if (s < steps) { emitter?.step(world); world.step(); }
  }
  if (out) { fs.writeFileSync(out, lines.join('\n') + '\n'); console.log(`wrote ${lines.length - 1} rows to ${out}`); }
  else process.stdout.write(lines.join('\n') + '\n');
}