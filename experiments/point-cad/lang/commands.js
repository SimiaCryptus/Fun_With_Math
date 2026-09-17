// Console-only verbs. The parser applies model-level commands directly to
// its working copy of the sketch; `solve` is handed back to the host.
import * as M from "../core/model.js";
import { alignSketchFrame } from "../core/problem.js";

export const COMMANDS = ["solve", "reset", "adopt", "center", "delete", "set", "move"];

/**
 * Apply a command to a sketch. Returns true when handled here, false when
 * the host must handle it (currently only `solve`). `registry` is optional
 * and only needed by commands that touch geometry (`center`).
 */
export function applyCommand(sketch, cmd, registry) {
  switch (cmd.op) {
    case "reset":
      M.resetSolution(sketch);
      return true;
    case "adopt":
      M.adoptSolution(sketch);
      return true;
    case "center":
      alignSketchFrame(sketch, registry);
      return true;
    case "delete":
      if (!M.removeEntity(sketch, cmd.ref)) throw new Error(`Unknown entity '${cmd.ref}'`);
      return true;
    case "set":
      M.setVariable(sketch, cmd.ref, cmd.value);
      return true;
    case "move":
      M.movePoint(sketch, cmd.ref, cmd.seed);
      return true;
    case "solve":
      return false;
    default:
      throw new Error(`Unknown command '${cmd.op}'`);
  }
}