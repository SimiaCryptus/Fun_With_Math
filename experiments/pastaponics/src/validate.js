// Stage 3 – the scoring function (problem.md §6.2). Consumes centrelines only.

import { sub, add, dist, lerp, clamp, cumulativeLength, circumradius, segSegClosest, SpatialHash } from './geom.js';
import { sectionProfiles } from './section.js';

const CAP = 3000;   // max overlay points per category

export function validate(routing, spec) {
  const chans = routing.channels.filter((c) => c.path && c.path.length >= 2);
  const cmin = spec.clearanceMin;
  const maxD = Math.max(1, ...spec.channels.map((c) => c.diameter));
  const pitchEq = routing.grid ? routing.grid.pitch : maxD + cmin;
  const bendFactor = spec.bendRadiusFactor ?? 1.5;

  const report = {
    generator: routing.generator,
    stats: routing.stats || {},
    warnings: [...(routing.warnings || [])],
    channels: {},
    clearanceOK: true, minClearance: Infinity, clearanceViolations: [], clearanceViolationCount: 0,
    minBendRadius: Infinity, bendViolations: [], bendViolationCount: 0,
    overhangRuns: [], overhangLength: 0,
    drainMinima: [],
    rootAccess: null,
  };

  // ---- per‑channel geometry, hydraulics and printability notes
  for (const ch of routing.channels) {
    const c = ch.spec;
    const row = {
      id: ch.id, name: c.name, colour: c.colour, cells: ch.cells ? ch.cells.length : null,
      deadEnd: !!ch.deadEnd, notes: [...(ch.notes || [])],
      length: 0, volume: 0, surface: 0, deltaP: 0, poresEst: 0, lumenRmin: 0, lumenArea: 0,
      minClearance: Infinity, minBend: Infinity, drainMinima: 0, overhangRuns: 0,
    };
    report.channels[ch.id] = row;
    if (c.wall < spec.printer.minWall) row.notes.push(`wall ${c.wall} mm < printer minimum ${spec.printer.minWall} mm`);
    const prof = sectionProfiles(c.section, c.diameter / 2, c.wall, 24);
    row.lumenRmin = prof.lumenRmin; row.lumenArea = prof.lumenArea;
    if (!prof.inner) row.notes.push('no lumen – wall ≥ radius (meshed as a solid rod)');
    else if (prof.lumenRmin < 0.5) row.notes.push(`lumen pinched to ${prof.lumenRmin.toFixed(2)} mm – increase Ø or reduce wall`);
    if (c.poreMode === 'explicit' && c.poreSize / 1000 < spec.printer.minFeature) {
      row.notes.push(`pore ${c.poreSize} µm < printable feature ${spec.printer.minFeature} mm – explicit pores are meshed at the printable size; consider material porosity`);
    }
    if (!ch.path || ch.path.length < 2) continue;
    const L = ch.length ?? cumulativeLength(ch.path)[ch.path.length - 1];
    row.length = L;
    row.surface = (prof.perimeter * L) / 100;               // cm²
    row.volume = (prof.lumenArea * L) / 1000;               // mL
    row.poresEst = c.poreMode === 'explicit' ? Math.round(row.surface * c.poreDensity) : 0;
    if (prof.inner) {
      const r = prof.rEq / 1000, Q = ((c.flowRate || 0) / 60) * 1e-6, mu = (c.viscosity || 1) * 1e-3;
      row.deltaP = (8 * mu * (L / 1000) * Q) / (Math.PI * r ** 4) / 1000;   // kPa
    } else row.deltaP = Infinity;
    if ((c.viscosity || 1) >= 3) {                          // slurry: horizontal runs sediment (§3.4)
      let flat = 0;
      for (let i = 0; i + 1 < ch.path.length; i++) {
        const a = ch.path[i], b = ch.path[i + 1], l = dist(a, b);
        if (l > 0 && Math.abs(b[2] - a[2]) / l < 0.1) flat += l;
      }
      if (flat / L > 0.3) row.notes.push(`slurry channel: ${Math.round((100 * flat) / L)} % of length is near‑horizontal (sedimentation risk)`);
    }
  }

  clearance(chans, report, cmin, maxD, pitchEq);
  curvature(chans, report, bendFactor);
  overhang(chans, report, spec);
  drainability(chans, report);
  report.rootAccess = rootAccess(chans, spec);
  if (report.rootAccess.fraction < 0.98) report.warnings.push(`root access: ${((1 - report.rootAccess.fraction) * 100).toFixed(1)} % of the eroded void is sealed off from the top face`);
  return report;
}

// ---------------------------------------------------------------- clearance
function clearance(chans, report, cmin, maxD, pitchEq) {
  const maxR = maxD / 2;
  const segs = [];
  chans.forEach((ch, ci) => {
    const cum = cumulativeLength(ch.path), r = ch.spec.diameter / 2;
    for (let i = 0; i + 1 < ch.path.length; i++) {
      const a = ch.path[i], b = ch.path[i + 1];
      segs.push({
        n: segs.length, ci, a, b, r, s: cum[i], stamp: -1,
        min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
        max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
      });
    }
  });
  const hash = new SpatialHash(Math.max(4, 2 * maxR + cmin + 2));
  for (const s of segs) hash.insert(s, s.min, s.max);
  // Same‑channel pairs closer than this along the path are neighbours on a bend, not approaches.
  const skipArc = 1.6 * pitchEq;
  for (const s of segs) {
    const m = s.r + maxR + cmin + 0.01, mv = [m, m, m];
    hash.query(sub(s.min, mv), add(s.max, mv), (t) => {
      if (t.n <= s.n || t.stamp === s.n) return;
      t.stamp = s.n;
      if (t.ci === s.ci && Math.abs(t.s - s.s) < skipArc) return;
      const { d, p, q } = segSegClosest(s.a, s.b, t.a, t.b);
      const cl = d - s.r - t.r;
      const rowA = report.channels[chans[s.ci].id], rowB = report.channels[chans[t.ci].id];
      if (cl < rowA.minClearance) rowA.minClearance = cl;
      if (cl < rowB.minClearance) rowB.minClearance = cl;
      if (cl < report.minClearance) report.minClearance = cl;
      if (cl < cmin - 1e-6) {
        report.clearanceViolationCount++;
        if (report.clearanceViolations.length < CAP) {
          report.clearanceViolations.push({ a: chans[s.ci].id, b: chans[t.ci].id, clearance: cl, p: lerp(p, q, 0.5) });
        }
      }
    });
  }
  report.clearanceOK = report.clearanceViolationCount === 0;
}

// ---------------------------------------------------------------- curvature
function curvature(chans, report, bendFactor) {
  for (const ch of chans) {
    const row = report.channels[ch.id], P = ch.path, limit = bendFactor * ch.spec.diameter;
    for (let i = 1; i + 1 < P.length; i++) {
      const R = circumradius(P[i - 1], P[i], P[i + 1]);
      if (!Number.isFinite(R) || R > 1e6) continue;
      if (R < row.minBend) row.minBend = R;
      if (R < report.minBendRadius) report.minBendRadius = R;
      if (R < limit) {
        report.bendViolationCount++;
        if (report.bendViolations.length < CAP) report.bendViolations.push({ ch: ch.id, p: P[i], r: R });
      }
    }
  }
}

// ---------------------------------------------------------------- overhang (FDM only)
function overhang(chans, report, spec) {
  if (spec.printer.process !== 'FDM') return;
  const maxAng = spec.printer.maxOverhangDeg, maxBridge = spec.printer.maxBridge;
  for (const ch of chans) {
    const row = report.channels[ch.id], P = ch.path;
    let run = null;
    const flush = () => {
      if (run && run.length > maxBridge) {
        report.overhangRuns.push(run); report.overhangLength += run.length; row.overhangRuns++;
      }
      run = null;
    };
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], L = dist(a, b);
      if (L < 1e-9) continue;
      const ang = (Math.acos(clamp(Math.abs(b[2] - a[2]) / L, 0, 1)) * 180) / Math.PI;
      if (ang > maxAng) {
        if (!run) run = { ch: ch.id, length: 0, pts: [a] };
        run.length += L; run.pts.push(b);
      } else flush();
    }
    flush();
  }
}

// ---------------------------------------------------------------- drainability
function drainability(chans, report) {
  const EPS = 0.05;
  for (const ch of chans) {
    const row = report.channels[ch.id], P = ch.path, n = P.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && Math.abs(P[j + 1][2] - P[i][2]) < EPS) j++;       // plateau i..j
      if (i > 0 && j < n - 1 && P[i - 1][2] > P[i][2] + EPS && P[j + 1][2] > P[j][2] + EPS) {
        row.drainMinima++;
        if (report.drainMinima.length < CAP) report.drainMinima.push({ ch: ch.id, p: P[(i + j) >> 1] });
      }
      i = j + 1;
    }
  }
}

// ---------------------------------------------------------------- root access
/** Voxelise the void, erode by c_min/2 (roots need a c_min gap), flood‑fill from the top face. */
function rootAccess(chans, spec) {
  const { x: dx, y: dy, z: dz } = spec.cartridge.dims, cmin = spec.clearanceMin;
  let v = Math.max(cmin / 2, 0.6);
  while ((dx / v) * (dy / v) * (dz / v) > 450000) v *= 1.1;
  const nx = Math.ceil(dx / v), ny = Math.ceil(dy / v), nz = Math.ceil(dz / v), total = nx * ny * nz;
  const ox = -dx / 2, oy = -dy / 2;
  const blocked = new Uint8Array(total);
  const id = (i, j, k) => (k * ny + j) * nx + i;

  for (const ch of chans) {
    const R = ch.spec.diameter / 2 + cmin / 2, R2 = R * R, P = ch.path;
    for (let s = 0; s + 1 < P.length; s++) {
      const a = P[s], b = P[s + 1];
      if (Math.max(a[2], b[2]) < -R) continue;
      const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], ee = Math.max(ex * ex + ey * ey + ez * ez, 1e-12);
      const i0 = clamp(Math.floor((Math.min(a[0], b[0]) - R - ox) / v), 0, nx - 1), i1 = clamp(Math.ceil((Math.max(a[0], b[0]) + R - ox) / v), 0, nx - 1);
      const j0 = clamp(Math.floor((Math.min(a[1], b[1]) - R - oy) / v), 0, ny - 1), j1 = clamp(Math.ceil((Math.max(a[1], b[1]) + R - oy) / v), 0, ny - 1);
      const k0 = clamp(Math.floor((Math.min(a[2], b[2]) - R) / v), 0, nz - 1), k1 = clamp(Math.ceil((Math.max(a[2], b[2]) + R) / v), 0, nz - 1);
      for (let k = k0; k <= k1; k++) {
        const cz = (k + 0.5) * v;
        for (let j = j0; j <= j1; j++) {
          const cy = oy + (j + 0.5) * v;
          for (let i = i0; i <= i1; i++) {
            const cx = ox + (i + 0.5) * v;
            const t = clamp(((cx - a[0]) * ex + (cy - a[1]) * ey + (cz - a[2]) * ez) / ee, 0, 1);
            const qx = cx - (a[0] + ex * t), qy = cy - (a[1] + ey * t), qz = cz - (a[2] + ez * t);
            if (qx * qx + qy * qy + qz * qz < R2) blocked[id(i, j, k)] = 1;
          }
        }
      }
    }
  }

  const seen = new Uint8Array(total), q = new Int32Array(total);
  let qh = 0, qt = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = id(i, j, nz - 1);
    if (!blocked[n]) { seen[n] = 1; q[qt++] = n; }
  }
  while (qh < qt) {
    const cur = q[qh++];
    const i = cur % nx, j = Math.floor(cur / nx) % ny, k = Math.floor(cur / (nx * ny));
    const tryN = (a, b, c) => {
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) return;
      const n = id(a, b, c);
      if (!blocked[n] && !seen[n]) { seen[n] = 1; q[qt++] = n; }
    };
    tryN(i + 1, j, k); tryN(i - 1, j, k); tryN(i, j + 1, k); tryN(i, j - 1, k); tryN(i, j, k + 1); tryN(i, j, k - 1);
  }
  let free = 0, reached = 0;
  const unreachable = [];
  for (let n = 0; n < total; n++) {
    if (blocked[n]) continue;
    free++;
    if (seen[n]) { reached++; continue; }
    if (unreachable.length < CAP && (free - reached) % 3 === 0) {
      unreachable.push([ox + ((n % nx) + 0.5) * v, oy + ((Math.floor(n / nx) % ny) + 0.5) * v, (Math.floor(n / (nx * ny)) + 0.5) * v]);
    }
  }
  return { fraction: free ? reached / free : 1, voidFraction: free / total, voxel: v, free, total, unreachable, unreachableCount: free - reached };
}