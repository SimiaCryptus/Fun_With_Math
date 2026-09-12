import { TIERS } from '../core/Tiers.js';
import { Grid } from './Grid.js';
import { BarrierField } from './BarrierField.js';
import { CpuSolver } from './CpuSolver.js';
import { TwinSolver } from './TwinSolver.js';
import { MetricsSuite } from '../metrics/Suite.js';
import { runRewind } from './Rewinder.js';

/**
 * Headless evaluation of a design at one depth: settle, measure, rewind-probe, score.
 * Generator so both the worker and the inline fallback can pump it.
 */
export function* evaluateDesign(job) {
  const tierDef = TIERS[job.tierName] || TIERS.C;
  const params = { ...job.params, H: job.H ?? job.params.H };
  const grid = Grid.forTier(tierDef, params.H);
  const bf = new BarrierField(grid.Nx, grid.Ny); bf.resampleFrom(job.mask, job.w, job.h);
  const solver = new CpuSolver(grid, params, { pIters: tierDef.pIters });
  solver.setBarriers(bf);
  const twin = params.twin && tierDef.twin ? new TwinSolver(solver) : null;
  const Tft = grid.Lx / solver.U0;
  const settle = (job.settleTime ?? 4) * Tft, measure = (job.measureTime ?? 2) * Tft;
  const metrics = new MetricsSuite(solver, twin, { settleTime: settle });
  const total = Math.ceil((settle + measure) / solver.dt);
  for (let n = 0; n < total; n++) { solver.step(); twin?.step(); metrics.tick(); if (n % 4 === 0) yield { progress: n / (total + 1) }; }
  const rw = runRewind(solver, job.rewindN ?? 120);
  metrics.setRewind(rw.D_rev);
  return { H: params.H, Nz: grid.Nz, kh: grid.kh, ...metrics.summary(), rewind: rw, steps: total };
}