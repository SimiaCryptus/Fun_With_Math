import { CpuSolver, SOLVER_VERSION } from './CpuSolver.js';
export { SOLVER_VERSION };
/**
 * Solver facade (§7.4). The GPU atlas backend plugs in here; until it lands every
 * tier uses the deterministic CPU reference implementation so measurements are
 * honest about what produced them (score strings carry `solver:<version>-cpu`).
 */
export class Solver extends CpuSolver {
  static backend = 'cpu';
  static precision = 'f32';
}