// Selected-observation detail: intervals, point-tree, provenance, q, credible intervals.
import { STATUS } from '../core/status.js';

const f3 = v => (isFinite(v) ? v.toFixed(3) : '–');

export function renderInspector(el, run, i, st) {
  if (!run || i < 0) { el.innerHTML = '<p class="muted">Click an observation to inspect it.</p>'; return; }
  const T = run.table, o = run.prob.obs[i], tree = run.tree, C = run.prob.C;
  const th = run.theories ? run.theories[Math.min(st.theory, run.theories.length - 1)] : null;
  const w = th ? th.w : T.pi;
  const bnd = run.bnd, env = bnd ? (st.env === 'ensemble' ? [bnd.eLo, bnd.eHi] : [bnd.lLo, bnd.lHi]) : null;
  let h = `<div><b>Observation ${i}</b> — allowed labels {${[...Array(C).keys()].filter(c => (o.Y >> c) & 1).join(',')}}</div>`;
  h += '<table><tr><th>dim</th><th>raw</th><th>current</th></tr>';
  for (let j = 0; j < run.prob.d; j++) h += `<tr><td>x${j}</td><td>[${f3(o.lo0[j])}, ${f3(o.hi0[j])}]</td><td>[${f3(o.lo[j])}, ${f3(o.hi[j])}]</td></tr>`;
  h += '</table>';

  // point-tree reconstruction
  const mass = new Map(), pm = new Map(), fragAt = new Map();
  for (let f = T.start[i]; f < T.start[i + 1]; f++) {
    fragAt.set(T.node[f], f);
    let n = T.node[f];
    while (n >= 0) { mass.set(n, (mass.get(n) || 0) + w[f]); pm.set(n, (pm.get(n) || 0) + T.pi[f]); n = tree.nodes[n].parent; }
  }
  h += '<div><b>Point-tree</b> <span class="muted">(bar: fitted ŵ; grey: prior π)</span></div><div class="ptree">';
  const rec = (nid, label, depth) => {
    if (!mass.has(nid)) return;
    const n = tree.nodes[nid], m = mass.get(nid), p = pm.get(nid);
    let line = `${'&nbsp;'.repeat(depth * 2)}${label} <span class="bar" style="width:${(m * 60).toFixed(0)}px"></span>` +
      `<span class="bar prior" style="width:${(p * 60).toFixed(0)}px;height:3px"></span> π=${f3(p)} ŵ=${f3(m)}`;
    if (n.leaf >= 0) {
      const f = fragAt.get(nid);
      line += ` leaf ${n.leaf}`;
      if (env) line += ` [${f3(env[0][f])}, ${f3(env[1][f])}]`;
      if (run.status) line += ` <i>${STATUS[run.status.frag[f]]}</i>`;
    }
    h += `<div>${line}</div>`;
    if (n.leaf < 0) {
      rec(n.left, `x${n.dim} &lt; ${n.t}`, depth + 1);
      rec(n.right, `x${n.dim} ≥ ${n.t}`, depth + 1);
    }
  };
  rec(0, 'root', 0);
  h += '</div>';
  if (env) h += '<div class="caption">Envelopes: inner / theory-conditional, not certified (§5.6)</div>';
  if (run.status) h += `<div class="caption">Status conditional on topology: ${tree.id}</div>`;

  // provenance
  const prov = run.sup ? run.sup.prov.filter(p => p.obs === i) : [];
  if (prov.length) {
    h += '<div><b>Exclusion provenance</b></div>';
    prov.forEach(p => {
      p.leaves.forEach(L => {
        const depths = L.anchors.map(a => a[1]);
        h += `<div class="prov" data-leaf="${L.leaf}" data-anchors="${L.anchors.map(a => a[0]).join(',')}">sweep ${p.sweep}: x${p.dim} ${p.side ? 'upper' : 'lower'} face ${f3(p.from)}→${f3(p.to)}; leaf ${L.leaf} (${L.anchors.length} anchors, max depth ${Math.max(...depths)})${p.lifted ? ' [lifted]' : ''}</div>`;
      });
    });
  }
  if (run.sup && run.sup.contradictions.includes(i)) h += '<div style="color:#c62828">Contradiction: every fragment inadmissible (label error or missing split?)</div>';

  // q bars
  if (th && th.q && (o.Y & (o.Y - 1))) {
    h += '<div><b>q<sub>i</sub> (post-hoc label read-off)</b></div>';
    for (let c = 0; c < C; c++) if ((o.Y >> c) & 1) h += `<div>class ${c} <span class="bar" style="width:${(th.q[i][c] * 100).toFixed(0)}px"></span> ${f3(th.q[i][c])}</div>`;
  }

  // feature-level credible intervals
  h += '<div><b>Feature-level credible intervals</b> <span class="muted">(light: hard support; dark: non-negligible mass in near-optimal theories)</span></div>';
  const up = env ? env[1] : w;
  for (let j = 0; j < run.prob.d; j++) {
    let a = Infinity, b = -Infinity;
    for (let f = T.start[i]; f < T.start[i + 1]; f++) if (up[f] >= 0.05) { a = Math.min(a, T.lo[f][j]); b = Math.max(b, T.hi[f][j]); }
    const hard = `left:${o.lo[j] * 100}%;width:${Math.max(0.5, (o.hi[j] - o.lo[j]) * 100)}%`;
    const soft = isFinite(a) ? `left:${a * 100}%;width:${Math.max(0.5, (b - a) * 100)}%` : 'display:none';
    h += `<div>x${j}</div><div class="ci"><div class="hard" style="${hard}"></div><div class="soft" style="${soft}"></div></div>`;
  }
  el.innerHTML = h;
}