import { CpuSolver, SOLVER_VERSION } from './CpuSolver.js';
import { GpuSolver } from './GpuSolver.js';
import { GpuContext } from './gpu/GpuContext.js';
import { log } from '../core/Log.js';
export { SOLVER_VERSION };
/**
 * Solver facade (§7.4). Picks the WebGPU backend when a device is available (and the caller has not
 * opted out), else the deterministic CPU reference. Both expose the same interface; the GPU one is
 * asynchronous (`isAsync`, `sync()`), and every instance reports `backend`, `precision` and `version`
 * so score strings and run hashes are honest about what produced them.
 */
export class Solver {
  static create(grid, params, opts = {}) {
    const { gpu = true, ...rest } = opts;
    if (gpu && GpuContext.current) {
      try { return new GpuSolver(grid, params, rest); }
      catch (err) { log.warn('GpuSolver construction failed; using the CPU solver', String(err)); }
    }
    return new CpuSolver(grid, params, rest);
  }
  static get backend() { return GpuContext.current ? 'webgpu' : 'cpu'; }
  static precision = 'f32';
}