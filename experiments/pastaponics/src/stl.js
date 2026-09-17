// Stage 5b (problem.md §6.7): binary STL writer, watertightness check, export pre‑flight.

export function toBinarySTL(meshes) {
  let nTri = 0;
  for (const m of meshes) nTri += m.indices.length / 3;
  const buf = new ArrayBuffer(84 + nTri * 50), dv = new DataView(buf);
  const header = 'PTRS lattice generator - mm - Z up';            // must not start with "solid"
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < header.length ? header.charCodeAt(i) & 0x7f : 0);
  dv.setUint32(80, nTri, true);
  let off = 84;
  for (const m of meshes) {
    const P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true);
      off += 12;
      for (const k of [a, b, c]) {
        dv.setFloat32(off, P[k], true); dv.setFloat32(off + 4, P[k + 1], true); dv.setFloat32(off + 8, P[k + 2], true);
        off += 12;
      }
      dv.setUint16(off, 0, true); off += 2;
    }
  }
  return buf;
}

export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Every directed edge must occur exactly once and its reverse exactly once. */
export function checkWatertight(mesh) {
  const I = mesh.indices, nV = mesh.positions.length / 3;
  const edges = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const k = I[t + e] * nV + I[t + ((e + 1) % 3)];
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  let open = 0, nonManifold = 0;
  for (const [k, cnt] of edges) {
    const a = Math.floor(k / nV), b = k - a * nV;
    const rev = edges.get(b * nV + a) || 0;
    if (cnt !== 1 || rev > 1) nonManifold++;
    else if (rev === 0) open++;
  }
  return { ok: open === 0 && nonManifold === 0, openEdges: open, nonManifoldEdges: nonManifold, triangles: I.length / 3 };
}

/** @returns {{ ok: boolean|null, msg: string }[]} – ok:null is informational */
export function preflight(meshes, spec, report) {
  const out = [];
  for (const m of meshes) {
    const w = checkWatertight(m);
    out.push({ ok: w.ok, msg: `${m.name || m.id}: ${w.triangles.toLocaleString()} tris – ${w.ok ? 'watertight' : `${w.openEdges} open / ${w.nonManifoldEdges} non‑manifold edges`}` });
    if (m.kind === 'tube') {
      if (m.wall < spec.printer.minWall) out.push({ ok: false, msg: `${m.name}: wall ${m.wall} mm < min wall ${spec.printer.minWall} mm` });
      if (m.poreCount) {
        const small = Math.min(...m.poreDims);
        out.push({ ok: small >= spec.printer.minFeature, msg: `${m.name}: ${m.poreCount} pores ≈ ${m.poreDims[0].toFixed(2)} × ${m.poreDims[1].toFixed(2)} mm (min feature ${spec.printer.minFeature} mm)` });
      }
    }
  }
  if (report && report.bbox) {
    const s = report.bbox.size, b = spec.printer.bed;
    out.push({ ok: report.bbox.fitsBed, msg: `bounding box ${s.map((v) => v.toFixed(0)).join(' × ')} mm vs bed ${b.x} × ${b.y} × ${b.z} mm` });
  }
  out.push({ ok: null, msg: 'shells overlap where tubes pass through the plate and where frame parts meet – slicers union them; use per‑channel export for multi‑material' });
  out.push({ ok: null, msg: 'tubes are anchored only at the plate – long cartridges may need frame bridges (problem.md §6.5) before printing' });
  return out;
}