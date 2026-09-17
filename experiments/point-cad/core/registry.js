import { Emitter } from "./events.js";

function assert(cond, msg) {
  if (!cond) throw new Error(`registry: ${msg}`);
}

/**
 * Extensibility contract: spaces, entity kinds, constraint kinds and solvers
 * are all registered here. The core never hard-codes any of them.
 */
export class Registry {
  constructor() {
    this.spaces = new Map();
    this.entityKinds = new Map();
    this.constraintKinds = new Map();
    this.solvers = new Map();
    this.events = new Emitter();
  }

  // ---- spaces ---------------------------------------------------------
  registerSpace(space) {
    assert(space && typeof space.id === "string", "space needs a string id");
    assert(Number.isInteger(space.dim) && space.dim > 0, `space '${space.id}' needs an integer dim`);
    for (const fn of ["distance", "angle", "interpolate", "normalize", "toDisplay", "fromDisplay"]) {
      assert(typeof space[fn] === "function", `space '${space.id}' is missing ${fn}()`);
    }
    this.spaces.set(space.id, space);
    this.events.emit("space", space);
    return space;
  }

  hasSpace(id) {
    return this.spaces.has(id);
  }

  getSpace(id) {
    const s = this.spaces.get(id);
    if (!s) throw new Error(`Unknown space '${id}'`);
    return s;
  }

  // ---- entity kinds ---------------------------------------------------
  registerEntityKind(kind) {
    assert(kind && typeof kind.id === "string", "entity kind needs a string id");
    assert(typeof kind.unknowns === "function", `entity kind '${kind.id}' needs unknowns()`);
    this.entityKinds.set(kind.id, kind);
    this.events.emit("entityKind", kind);
    return kind;
  }

  getEntityKind(id) {
    const k = this.entityKinds.get(id);
    if (!k) throw new Error(`Unknown entity kind '${id}'`);
    return k;
  }

  // ---- constraint kinds -----------------------------------------------
  registerConstraintKind(kind) {
    assert(kind && typeof kind.id === "string", "constraint kind needs a string id");
    assert(kind.arity && Number.isInteger(kind.arity.points), `constraint kind '${kind.id}' needs arity.points`);
    assert(typeof kind.measure === "function", `constraint kind '${kind.id}' needs measure()`);
    const placeholders = Array.from({ length: kind.arity.points }, (_, i) => `<P${i + 1}>`).join(" ");
    const full = {
      spaces: "*",
      unit: "length",
      syntax: `${kind.id} ${placeholders}`,
      ...kind,
    };
    this.constraintKinds.set(full.id, full);
    this.events.emit("constraintKind", full);
    return full;
  }

  hasConstraintKind(id) {
    return this.constraintKinds.has(id);
  }

  getConstraintKind(id) {
    const k = this.constraintKinds.get(id);
    if (!k) throw new Error(`Unknown constraint kind '${id}'`);
    return k;
  }

  kindSupportsSpace(kind, spaceId) {
    return kind.spaces === "*" || (Array.isArray(kind.spaces) && kind.spaces.includes(spaceId));
  }

  constraintKindsFor(spaceId) {
    return [...this.constraintKinds.values()].filter((k) => this.kindSupportsSpace(k, spaceId));
  }

  // ---- solvers --------------------------------------------------------
  registerSolver(solver) {
    assert(solver && typeof solver.id === "string", "solver needs a string id");
    assert(typeof solver.solve === "function", `solver '${solver.id}' needs solve()`);
    this.solvers.set(solver.id, solver);
    this.events.emit("solver", solver);
    return solver;
  }

  getSolver(id) {
    const s = this.solvers.get(id);
    if (!s) throw new Error(`Unknown solver '${id}'`);
    return s;
  }
}

/** Shared default registry used by the element and the language. */
export const registry = new Registry();