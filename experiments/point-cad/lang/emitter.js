// Sketch -> PCS script with stable ordering and a source map (id -> line).
import { IDENT_RE, findPoint } from "../core/model.js";
import { RESERVED } from "./parser.js";

export function fmtNum(n) {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  if (a !== 0 && a < 1e-4) return String(Number(n.toPrecision(6)));
  return String(Math.round(n * 1e6) / 1e6);
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const vec = (v) => `(${v.map(fmtNum).join(", ")})`;

function identMap(items, field, reservedExtra) {
  const counts = new Map();
  for (const it of items) counts.set(it[field], (counts.get(it[field]) ?? 0) + 1);
  const ids = new Set(items.map((i) => i.id));
  const map = new Map();
  for (const it of items) {
    const name = it[field];
    const ok =
      typeof name === "string" &&
      IDENT_RE.test(name) &&
      counts.get(name) === 1 &&
      !RESERVED.has(name) &&
      !reservedExtra.has(name) &&
      (!ids.has(name) || name === it.id);
    map.set(it.id, ok ? name : it.id);
  }
  return map;
}

function targetText(c, varIdent) {
  const t = c.target ?? { kind: "value", value: 0 };
  switch (t.kind) {
    case "value": return `= ${fmtNum(t.value)}`;
    case "variable": return `= ${varIdent.get(t.ref) ?? t.ref}`;
    case "minimize": return "-> min";
    case "maximize": return "-> max";
    default: return `= 0`;
  }
}

/**
 * Emit a sketch as PCS. Returns `{ text, map }` where `map` associates entity
 * ids (and "solver", "view") with 1-based line numbers.
 */
export function emitWithMap(sketch, { adoptSolution = false, header = true, registry = null } = {}) {
  const lines = [];
  const map = new Map();
  const add = (text, id) => {
    if (id) map.set(id, lines.length + 1);
    lines.push(text);
  };
  const kindNames = new Set(registry ? registry.constraintKinds.keys() : sketch.constraints.map((c) => c.type));
  const pointIdent = identMap(sketch.points, "label", kindNames);
  const varIdent = identMap(sketch.variables, "name", kindNames);

  if (header) add(`# Point-CAD sketch (PCS v${sketch.version ?? 1})`);
  add(`space ${sketch.space}`);
  add(`units ${sketch.units.length} ${sketch.units.angle}`);

  const vars = sketch.variables.filter((v) => !v.macro);
  if (vars.length) add("");
  for (const v of vars) {
    const value = adoptSolution && v.solved != null ? v.solved : v.value;
    add(`var ${varIdent.get(v.id)} = ${fmtNum(value)}${v.locked ? " locked" : ""}`, v.id);
  }

  const points = sketch.points.filter((p) => !p.macro);
  if (points.length) add("");
  for (const p of points) {
    const ident = pointIdent.get(p.id);
    const pos = adoptSolution && p.solved ? p.solved : p.seed;
    let line = `point ${ident} at ${vec(pos)}`;
    if (p.fixed) line += " fixed";
    if (ident !== p.label) line += ` label "${esc(p.label)}"`;
    add(line, p.id);
  }

  const constraints = sketch.constraints.filter((c) => !c.macro);
  if (constraints.length) add("");
  const keyCount = new Map();
  for (const c of constraints) {
    const key = `${c.type}|${c.points.join(",")}`;
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }
  for (const c of constraints) {
    let line = `${c.type} ${c.points.map((id) => pointIdent.get(id) ?? id).join(" ")} ${targetText(c, varIdent)}`;
    if (c.weight !== undefined && c.weight !== 1) line += ` weight ${fmtNum(c.weight)}`;
    if (c.enabled === false) line += " disabled";
    if (c.note) line += ` note "${esc(c.note)}"`;
    if (keyCount.get(`${c.type}|${c.points.join(",")}`) > 1) line += ` id ${c.id}`;
    add(line, c.id);
  }

  for (const def of sketch.macros) {
    add("");
    add(`def ${def.name}(${def.params.join(", ")}) {`, `def:${def.name}`);
    for (const l of String(def.body).split("\n").map((s) => s.trim()).filter(Boolean)) add(`  ${l}`);
    add("}");
  }
  if (sketch.macroCalls.length) add("");
  for (const call of sketch.macroCalls) {
    const args = call.args.map((a) => {
      const p = findPoint(sketch, a);
      return p ? pointIdent.get(p.id) : a;
    });
    add(`${call.name} ${args.join(" ")}`, call.id);
  }

  add("");
  const s = sketch.solver;
add(`solver ${s.method} iterations ${s.maxIterations} tolerance ${s.tolerance} objective ${fmtNum(s.objectiveScale ?? 0.001)} frame ${s.frame ?? "auto"}`, "solver");
  const cam = sketch.view.camera;
  add(`view camera ${vec(cam.position)} target ${vec(cam.target)} up ${vec(cam.up)} ${cam.projection} fov ${fmtNum(cam.fov)}`, "view");
  const shown = ["seeds", "labels", "axes"].filter((f, i) => sketch.view[["showSeeds", "showLabels", "showAxes"][i]]);
  const hidden = ["seeds", "labels", "axes"].filter((f) => !shown.includes(f));
  add(`view grid ${sketch.view.grid}${shown.length ? ` show ${shown.join(" ")}` : ""}${hidden.length ? ` hide ${hidden.join(" ")}` : ""}`);

  return { text: lines.join("\n") + "\n", map };
}

export function emit(sketch, options) {
  return emitWithMap(sketch, options).text;
}