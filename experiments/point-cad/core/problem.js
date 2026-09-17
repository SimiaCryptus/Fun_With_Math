// Turns a Sketch into a numerical problem: unknown vector, residual function
// and a way to write a solution back.
import { registry as defaultRegistry } from "./registry.js";

const MAX_EPS = 1e-3;

export function buildProblem(sketch, reg = defaultRegistry) {
  const space = reg.getSpace(sketch.space);
  const dim = space.dim;
  const layout = [];
  let n = 0;

  const pointOffset = new Map();
  for (const p of sketch.points) {
    if (p.fixed) continue;
    pointOffset.set(p.id, n);
    layout.push({ kind: "point", id: p.id, offset: n, size: dim });
    n += dim;
  }
  const varOffset = new Map();
  for (const v of sketch.variables) {
    if (v.locked) continue;
    varOffset.set(v.id, n);
    layout.push({ kind: "variable", id: v.id, offset: n, size: 1 });
    n += 1;
  }

  const x0 = new Float64Array(n);
  for (const p of sketch.points) {
    const o = pointOffset.get(p.id);
    if (o === undefined) continue;
    for (let k = 0; k < dim; k++) x0[o + k] = p.seed[k] ?? 0;
  }
  for (const v of sketch.variables) {
    const o = varOffset.get(v.id);
    if (o !== undefined) x0[o] = v.value ?? 0;
  }

  const pointById = new Map(sketch.points.map((p) => [p.id, p]));
  const varById = new Map(sketch.variables.map((v) => [v.id, v]));
  const objectiveScale = sketch.solver?.objectiveScale ?? 0.001;
const frameMode = sketch.solver?.frame ?? "auto";
const fixedPoints = sketch.points.filter((p) => p.fixed);

  const terms = [];
  for (const c of sketch.constraints) {
    if (c.enabled === false) continue;
    const kind = reg.getConstraintKind(c.type);
    if (!reg.kindSupportsSpace(kind, sketch.space)) {
      throw new Error(`Constraint '${c.id}': kind '${c.type}' is not available in space '${sketch.space}'`);
    }
    if (c.points.length !== kind.arity.points) {
      throw new Error(`Constraint '${c.id}': '${c.type}' needs ${kind.arity.points} points`);
    }
    for (const id of c.points) {
      if (!pointById.has(id)) throw new Error(`Constraint '${c.id}' references unknown point '${id}'`);
    }
    const w = Math.sqrt(Math.max(c.weight ?? 1, 0));
    const t = c.target ?? { kind: "value", value: 0 };
    let targetFn = null;
    let isEquality = true;
    if (t.kind === "value") {
      targetFn = () => t.value;
    } else if (t.kind === "variable") {
      const v = varById.get(t.ref);
      if (!v) throw new Error(`Constraint '${c.id}' references unknown variable '${t.ref}'`);
      const o = varOffset.get(v.id);
      targetFn = o === undefined ? () => v.value : (x) => x[o];
    } else if (t.kind === "minimize" || t.kind === "maximize") {
      isEquality = false;
    } else {
      throw new Error(`Constraint '${c.id}': unknown target kind '${t.kind}'`);
    }
    terms.push({
      constraint: c,
      kind,
      pointIds: c.points.slice(),
      targetFn,
      targetKind: t.kind,
      isEquality,
      w: isEquality ? w : w * Math.sqrt(objectiveScale),
    });
  }

  function positions(x) {
    const pos = new Map();
    for (const p of sketch.points) {
      const o = pointOffset.get(p.id);
      pos.set(p.id, o === undefined ? p.seed : Array.prototype.slice.call(x, o, o + dim));
    }
    return pos;
  }

  function measures(x) {
    const pos = positions(x);
    return terms.map((t) => t.kind.measure(t.pointIds.map((id) => pos.get(id)), space));
  }

  function residuals(x) {
    const ms = measures(x);
    const r = new Float64Array(terms.length);
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const m = ms[i];
      if (t.isEquality) r[i] = t.w * (m - t.targetFn(x));
      else if (t.targetKind === "minimize") r[i] = t.w * m;
      else r[i] = t.w / (Math.abs(m) + MAX_EPS);
    }
    return r;
  }

  function normalize(x) {
    for (const [, o] of pointOffset) {
      const c = space.normalize(Array.prototype.slice.call(x, o, o + dim));
      for (let k = 0; k < dim; k++) x[o + k] = c[k];
    }
    return x;
  }
/**
  * Rigid-body gauge fix. A sketch with no anchors is only defined up to a
  * rigid motion (6 DOF in ℝ³; 3 with one fixed point). Instead of reporting
  * that freedom as slack we pin it: the solved cloud is re-centred and
  * aligned to its principal axes (a single fixed point stays put and acts
  * as the pivot). Measures are rigid-motion invariant, so residuals do not
  * change. Returns true when the unknown vector was modified.
  */
function alignFrame(x) {
   if (frameMode === "none" || typeof space.alignFrame !== "function") return false;
   if (fixedPoints.length > 1 || pointOffset.size === 0) return false;
   const pos = positions(x);
   const coords = sketch.points.map((p) => pos.get(p.id));
   const pivot = fixedPoints.length ? pos.get(fixedPoints[0].id) : null;
   const aligned = space.alignFrame(coords, { pivot });
   sketch.points.forEach((p, i) => {
     const o = pointOffset.get(p.id);
     if (o === undefined) return;
     for (let k = 0; k < dim; k++) x[o + k] = aligned[i][k];
   });
   return true;
}


  function apply(x, target = sketch) {
    const pos = positions(x);
    for (const p of target.points) {
      const c = pos.get(p.id);
      if (c) p.solved = Array.from(c);
    }
    for (const v of target.variables) {
      const o = varOffset.get(v.id);
      if (o !== undefined) v.solved = x[o];
    }
    return target;
  }

  return {
    sketch,
    space,
    dim,
    n,
    m: terms.length,
    layout,
    x0,
    terms,
    pointOffset,
    varOffset,
   fixedPointCount: fixedPoints.length,
   frameMode,
    positions,
    measures,
    residuals,
    normalize,
   alignFrame,
    apply,
  };
}

export function statusFor(residual, tol = 1e-3) {
  const a = Math.abs(residual);
  if (!Number.isFinite(a)) return "error";
  return a <= tol ? "ok" : a <= tol * 1000 ? "warn" : "bad";
}

/**
 * Evaluate every constraint at the current (solved, else seed) positions.
 * Used for diagnostics and glyph colouring even before a solve.
 */
export function evaluateConstraints(sketch, reg = defaultRegistry, { useSolved = true } = {}) {
  const space = reg.hasSpace(sketch.space) ? reg.getSpace(sketch.space) : null;
  const pointById = new Map(sketch.points.map((p) => [p.id, p]));
  const varById = new Map(sketch.variables.map((v) => [v.id, v]));
  return sketch.constraints.map((c) => {
    const out = { id: c.id, type: c.type, measure: null, target: null, residual: null, status: "none", error: null };
    if (!space) return Object.assign(out, { status: "error", error: `Unknown space '${sketch.space}'` });
    if (!reg.hasConstraintKind(c.type)) return Object.assign(out, { status: "error", error: `Unknown kind '${c.type}'` });
    const kind = reg.getConstraintKind(c.type);
    const coords = c.points.map((id) => {
      const p = pointById.get(id);
      return p ? (useSolved && p.solved) || p.seed : null;
    });
    if (coords.length !== kind.arity.points || coords.some((x) => !x)) {
      return Object.assign(out, { status: "error", error: "Missing point" });
    }
    out.measure = kind.measure(coords, space);
    const t = c.target ?? { kind: "value", value: 0 };
    if (t.kind === "value") out.target = t.value;
    else if (t.kind === "variable") {
      const v = varById.get(t.ref);
      if (!v) return Object.assign(out, { status: "error", error: `Unknown variable '${t.ref}'` });
      out.target = useSolved && !v.locked && v.solved != null ? v.solved : v.value;
    }
    if (c.enabled === false) return Object.assign(out, { status: "disabled" });
    if (t.kind === "minimize" || t.kind === "maximize") return Object.assign(out, { status: "objective" });
    out.residual = out.measure - out.target;
    out.status = statusFor(out.residual);
    return out;
  });
}
/**
* Re-centre a sketch and align it to its principal axes; seeds and solved
* positions move together under the same rigid transform. Skipped when two
* or more points are fixed (the anchors define the frame), when there are no
* points, or when the space has no `frameTransform`. A single fixed point
* stays in place and acts as the pivot. Returns true when applied.
*/
export function alignSketchFrame(sketch, reg = defaultRegistry) {
  const space = reg.getSpace(sketch.space);
  if (typeof space.frameTransform !== "function" || sketch.points.length === 0) return false;
  const fixed = sketch.points.filter((p) => p.fixed);
  if (fixed.length > 1) return false;
  const current = sketch.points.map((p) => p.solved ?? p.seed);
  const pivot = fixed.length ? fixed[0].solved ?? fixed[0].seed : null;
  const T = space.frameTransform(current, { pivot });
  for (const p of sketch.points) {
    p.seed = T.apply(p.seed);
    if (p.solved) p.solved = T.apply(p.solved);
  }
  return true;
}