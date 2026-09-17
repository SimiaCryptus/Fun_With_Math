// Spec → routing → post‑process → validate → mesh (problem.md §2). Deterministic from spec.seed.

import { mulberry32, hashSeed } from './rng.js';
import { generate } from './generators/index.js';
import { postprocess } from './postprocess.js';
import { validate } from './validate.js';
import { buildMeshes, bboxOf, QUALITY } from './mesh.js';

export function runPipeline(spec, quality = QUALITY.preview) {
  const t0 = performance.now();
  const rng = mulberry32(hashSeed(String(spec.seed)));
  const routing = generate(spec, rng);
  postprocess(routing, spec, rng);
  const report = validate(routing, spec);
  const meshes = buildMeshes(routing, spec, quality);
  report.warnings.push(...meshes.notes);
  const all = allMeshes(meshes);
  const bb = bboxOf(all), bed = spec.printer.bed;
  report.bbox = { ...bb, fitsBed: bb.size[0] <= bed.x && bb.size[1] <= bed.y && bb.size[2] <= bed.z };
  if (!report.bbox.fitsBed) report.warnings.push('model exceeds the print bed – shrink the cartridge or split into modules');
  report.triangles = all.reduce((a, m) => a + m.indices.length / 3, 0);
  report.quality = quality.key;
  report.timingMs = performance.now() - t0;
  return { spec, routing, report, meshes };
}

export function allMeshes(meshes) {
  return [...meshes.tubes, meshes.plate, meshes.frame].filter(Boolean);
}

/** Shareable bundle: spec + centrelines + report summary (problem.md §3.5 outputs). */
export function bundle(result) {
  const { spec, routing, report } = result;
  const r3 = (p) => p.map((v) => Math.round(v * 1000) / 1000);
  return {
    format: 'ptrs-lattice/1',
    spec,
    routing: {
      generator: routing.generator,
      grid: routing.grid,
      channels: routing.channels.map((c) => ({
        id: c.id, name: c.spec.name, deadEnd: !!c.deadEnd, ports: c.ports, notes: c.notes, cells: c.cells || null,
        centreline: (c.path || []).map(r3),
      })),
    },
    report: {
      ...report,
      clearanceViolations: report.clearanceViolations.length,
      bendViolations: report.bendViolations.length,
      overhangRuns: report.overhangRuns.length,
      drainMinima: report.drainMinima.length,
      rootAccess: { ...report.rootAccess, unreachable: undefined },
    },
  };
}