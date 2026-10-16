export function toOBJ(meshes) {
  const out = ['# Ribbon Engine OBJ'];
  let base = 1;
  for (const m of meshes) {
    out.push(`o ${m.name}`);
    const p = m.position, [ox, oy, oz] = m.offset;
    for (let i = 0; i < p.length; i += 3) out.push(`v ${(p[i] + ox).toFixed(5)} ${(p[i + 1] + oy).toFixed(5)} ${(p[i + 2] + oz).toFixed(5)}`);
    for (let i = 0; i < p.length / 3; i += 3) out.push(`f ${base + i} ${base + i + 1} ${base + i + 2}`);
    base += p.length / 3;
  }
  return out.join('\n');
}

export function toSTL(meshes) {
  const out = ['solid ribbon'];
  for (const m of meshes) {
    const p = m.position, [ox, oy, oz] = m.offset;
    for (let i = 0; i < p.length; i += 9) {
      out.push(' facet normal 0 0 0', '  outer loop');
      for (let k = 0; k < 9; k += 3) out.push(`   vertex ${p[i + k] + ox} ${p[i + k + 1] + oy} ${p[i + k + 2] + oz}`);
      out.push('  endloop', ' endfacet');
    }
  }
  out.push('endsolid ribbon');
  return out.join('\n');
}