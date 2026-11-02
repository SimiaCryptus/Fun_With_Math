// All 3D layers. Hard layer on the floor (geometry), soft layer above it (height / opacity).
import * as THREE from 'three';
import { spreadBox } from '../core/cells.js';
import { CLASS_COLORS, STATUS_COLORS, mixClasses, labelColor, isSingleton } from './palette.js';

export const S = 10;
const HU = 1.2; // column height of the geometric prior (lid)

export function W(d, x, h = 0) {
  return d === 2 ? new THREE.Vector3((x[0] - 0.5) * S, h, (x[1] - 0.5) * S)
    : new THREE.Vector3((x[0] - 0.5) * S, x[2] * S, (x[1] - 0.5) * S);
}

class LineBuf {
  constructor() { this.p = []; this.c = []; }
  seg(a, b, col) { this.p.push(a.x, a.y, a.z, b.x, b.y, b.z); this.c.push(col.r, col.g, col.b, col.r, col.g, col.b); }
}

function outline(buf, d, lo, hi, h, col) {
  if (d === 2) {
    const [l0, l1] = lo, [h0, h1] = hi, t = 0.008;
    if (h0 - l0 < 1e-9 && h1 - l1 < 1e-9) {
      buf.seg(W(2, [l0 - t, l1], h), W(2, [l0 + t, l1], h), col);
      buf.seg(W(2, [l0, l1 - t], h), W(2, [l0, l1 + t], h), col);
      return;
    }
    const c = [[l0, l1], [h0, l1], [h0, h1], [l0, h1]];
    for (let k = 0; k < 4; k++) buf.seg(W(2, c[k], h), W(2, c[(k + 1) % 4], h), col);
  } else {
    const P = (a, b, c) => W(3, [a ? hi[0] : lo[0], b ? hi[1] : lo[1], c ? hi[2] : lo[2]]);
    for (const [a, b, c, e] of [[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 1, 1, 0], [0, 0, 0, 1], [1, 0, 0, 1], [0, 0, 1, 1], [1, 0, 1, 1], [0, 0, 0, 2], [1, 0, 0, 2], [0, 1, 0, 2], [1, 1, 0, 2]]) {
      const s = [a, b, c], t = s.slice(); t[e] = 1;
      buf.seg(P(...s), P(...t), col);
    }
  }
}

function flush(group, buf, { opacity = 1, dashed = false } = {}) {
  if (!buf.p.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
  const m = dashed
    ? new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 0.1, gapSize: 0.07, transparent: opacity < 1, opacity })
    : new THREE.LineBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity });
  const L = new THREE.LineSegments(g, m);
  if (dashed) L.computeLineDistances();
  group.add(L);
}

function clear(group) {
  for (const c of [...group.children]) {
    group.remove(c);
    c.traverse(o => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
  }
}

function tile(group, lo, hi, color, opacity, y = -0.01) {
  const g = new THREE.PlaneGeometry(Math.max(hi[0] - lo[0], 0.004) * S, Math.max(hi[1] - lo[1], 0.004) * S);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(W(2, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], y));
  group.add(m);
}

function anchorCounts(run) {
  const T = run.table, C = run.prob.C, cnt = Array.from({ length: T.L }, () => new Array(C).fill(0));
  for (let i = 0; i < T.N; i++) {
    if (T.start[i + 1] - T.start[i] !== 1) continue;
    const Y = run.prob.obs[i].Y;
    if (!isSingleton(Y)) continue;
    cnt[T.leaf[T.start[i]]][Math.log2(Y)]++;
  }
  return cnt;
}

function drawPartition(group, run, mode, th, opacity) {
  const d = run.prob.d, tree = run.tree, C = run.prob.C;
  const lb = new LineBuf(), grey = new THREE.Color(0x999999);
  const cnt = mode === 'anchors' ? anchorCounts(run) : null;
  tree.leaves.forEach((nid, l) => {
    const n = tree.nodes[nid];
    outline(lb, d, n.lo, n.hi, 0, grey);
    if (d !== 2) return;
    let col = new THREE.Color(0xeeeeee);
    if (mode === 'anchors') col = mixClasses(cnt[l]);
    else if (mode === 'phi' && th) col = mixClasses(Array.from({ length: C }, (_, c) => th.phi[l * C + c]));
    tile(group, n.lo, n.hi, col, mode === 'none' ? 0.25 : opacity);
    if (run.sup && mode !== 'none') {
      for (let c = 0; c < C; c++) {
        if (!(run.sup.excl[l] & (1 << c))) continue;
        const xb = new LineBuf(), cc = new THREE.Color(CLASS_COLORS[c]), o = 0.02 + 0.015 * c;
        const a = [n.lo[0] + o, n.lo[1] + o], b = [n.hi[0] - o, n.hi[1] - o];
        xb.seg(W(2, a, 0.01), W(2, b, 0.01), cc);
        xb.seg(W(2, [a[0], b[1]], 0.01), W(2, [b[0], a[1]], 0.01), cc);
        flush(group, xb);
      }
    }
  });
  flush(group, lb, { opacity: 0.6 });
}

function supportsAt(run, st) {
  if (st.view === 'contraction' && run.sup && st.snap >= 0) {
    const s = run.sup.snaps[Math.min(st.snap, run.sup.snaps.length - 1)];
    return { lo: s.lo, hi: s.hi, sweep: s.sweep };
  }
  return { lo: run.prob.obs.map(o => o.lo), hi: run.prob.obs.map(o => o.hi), sweep: Infinity };
}

function drawSupports(group, run, st, colorFn, { raw = false, opacity = 0.9 } = {}) {
  const d = run.prob.d, obs = run.prob.obs, sup = supportsAt(run, st);
  const solid = new LineBuf(), dashed = new LineBuf();
  obs.forEach((o, i) => {
    const lo = raw ? o.lo0 : sup.lo[i], hi = raw ? o.hi0 : sup.hi[i];
    const r = colorFn(i);
    if (!r) return;
    outline(r.dashed ? dashed : solid, d, lo, hi, 0.005, r.color);
  });
  flush(group, solid, { opacity });
  flush(group, dashed, { opacity, dashed: true });
  return sup;
}

function drawSlabs(group, run, upToSweep) {
  if (!run.sup) return;
  const d = run.prob.d, lb = new LineBuf(), red = new THREE.Color(0xD55E00);
  for (const p of run.sup.prov) {
    if (p.sweep > upToSweep) continue;
    if (d === 2) tile(group, p.slabLo, p.slabHi, 0xD55E00, 0.12, 0.002);
    else outline(lb, d, p.slabLo, p.slabHi, 0, red);
  }
  flush(group, lb, { opacity: 0.4 });
}

function currentW(run, st) {
  if (!run.theories) return run.table.pi;
  const th0 = run.theories[0];
  if (st.view === 'mass' && st.iter >= 0 && th0.snaps) return th0.snaps[Math.min(st.iter, th0.snaps.length - 1)].w;
  if (['theory', 'envelope', 'status'].includes(st.view)) return run.theories[Math.min(st.theory, run.theories.length - 1)].w;
  return th0.w;
}

function landscape(group, run, w, { prior = true, yOff = 0, flat = false } = {}) {
  const GL = 32, T = run.table, acc = new Float64Array(GL * GL), pacc = new Float64Array(GL * GL);
  for (let f = 0; f < T.n; f++) {
    if (w[f] > 0) spreadBox(T.lo[f], T.hi[f], w[f], GL, 2, (c, v) => { acc[c] += v; });
    if (prior) spreadBox(T.lo[f], T.hi[f], T.pi[f], GL, 2, (c, v) => { pacc[c] += v; });
  }
  let mx = 1e-12;
  for (let c = 0; c < acc.length; c++) mx = Math.max(mx, acc[c], prior ? pacc[c] : 0);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), GL * GL);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), cs = S / GL;
  const lb = new LineBuf(), white = new THREE.Color(0x222222);
  for (let cy = 0; cy < GL; cy++) for (let cx = 0; cx < GL; cx++) {
    const idx = cx + cy * GL, v = acc[idx] / mx, h = flat ? 0.06 : Math.max(0.01, v * 4);
    const pos = W(2, [(cx + 0.5) / GL, (cy + 0.5) / GL], yOff + h / 2);
    m4.compose(pos, q, new THREE.Vector3(cs * 0.92, h, cs * 0.92));
    im.setMatrixAt(idx, m4);
    col.setHSL(0.62 - 0.62 * v, 0.7, 0.5);
    im.setColorAt(idx, col);
    if (prior && !flat) {
      const ph = yOff + (pacc[idx] / mx) * 4 + 0.01;
      outline(lb, 2, [cx / GL + 0.004, cy / GL + 0.004], [(cx + 1) / GL - 0.004, (cy + 1) / GL - 0.004], ph, white);
    }
  }
  group.add(im);
  flush(group, lb, { opacity: 0.25 });
}

function columns(group, run, i, w, colorFn, { ghost = null, ring = null } = {}) {
  const T = run.table, d = run.prob.d, o = run.prob.obs[i];
  if (d === 2) {
    const lid = new LineBuf();
    outline(lid, 2, o.lo, o.hi, HU, new THREE.Color(0x000000));
    flush(group, lid, { opacity: 0.6 });
    tile(group, o.lo, o.hi, 0xffffff, 0.25, HU);
  }
  for (let f = T.start[i]; f < T.start[i + 1]; f++) {
    const lo = T.lo[f], hi = T.hi[f];
    const col = colorFn(f);
    if (d === 2) {
      const sx = Math.max(hi[0] - lo[0], 0.012) * S, sz = Math.max(hi[1] - lo[1], 0.012) * S;
      const h = Math.max(0.005, Math.min(6, w[f] / T.pi[f]) * HU);
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.96, h, sz * 0.96), new THREE.MeshLambertMaterial({ color: col }));
      m.position.copy(W(2, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], h / 2));
      group.add(m);
      if (ghost) {
        const gh = Math.max(0.005, Math.min(6, ghost[f] / T.pi[f]) * HU);
        const eg = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx * 0.98, gh, sz * 0.98)),
          new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 }));
        eg.position.copy(W(2, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], gh / 2));
        group.add(eg);
      }
      if (ring) {
        const rb = new LineBuf();
        outline(rb, 2, lo, hi, Math.min(6, ring[f] / T.pi[f]) * HU + 0.01, new THREE.Color(0xc62828));
        flush(group, rb);
      }
    } else {
      const sz = [0, 1, 2].map(j => Math.max(hi[j] - lo[j], 0.01) * S);
      const m = new THREE.Mesh(new THREE.BoxGeometry(sz[0], sz[2], sz[1]),
        new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.1 + 0.8 * w[f], depthWrite: false }));
      m.position.copy(W(3, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]));
      group.add(m);
    }
  }
}

export function renderScene(group, run, st) {
  clear(group);
  if (!run) return;
  const d = run.prob.d, C = run.prob.C, obs = run.prob.obs, view = st.view;
  const thIdx = run.theories ? Math.min(st.theory, run.theories.length - 1) : 0;
  const th = run.theories ? run.theories[thIdx] : null;
  const w = currentW(run, st);
  const tileMode = view === 'partition' ? st.colorBy : view === 'theory' ? 'phi' : 'none';
  drawPartition(group, run, tileMode, th, view === 'partition' || view === 'theory' ? 0.55 : 0.25);

  const labelCol = i => ({ color: labelColor(obs[i].Y, C), dashed: !isSingleton(obs[i].Y) });
  const fragCol = f => {
    const l = run.table.leaf[f];
    return th ? mixClasses(Array.from({ length: C }, (_, c) => th.phi[l * C + c])) : new THREE.Color(0x888888);
  };

  if (view === 'data') {
    drawSupports(group, run, st, labelCol, { raw: true });
  } else if (view === 'partition') {
    drawSupports(group, run, st, labelCol, { opacity: 0.25 });
  } else if (view === 'contraction') {
    drawSupports(group, run, st, () => ({ color: new THREE.Color(0xbbbbbb) }), { raw: true, opacity: 0.35 });
    const sup = drawSupports(group, run, st, labelCol);
    drawSlabs(group, run, sup.sweep);
  } else if (view === 'mass' || view === 'envelope' || view === 'theory') {
    drawSupports(group, run, st, labelCol, { opacity: 0.15 });
    if (st.sel >= 0) {
      const env = run.bnd ? (st.env === 'ensemble' ? [run.bnd.eHi, run.bnd.eLo] : [run.bnd.lHi, run.bnd.lLo]) : [null, null];
      columns(group, run, st.sel, w, fragCol, view === 'envelope' ? { ghost: env[0], ring: env[1] } : {});
    } else if (d === 2) {
      if (view === 'theory' && st.stack && run.theories) {
        run.theories.forEach((t, k) => landscape(group, run, t.w, { prior: false, yOff: 0.3 + k * 1.2, flat: true }));
      } else if (view === 'envelope' && run.bnd) {
        const lo = st.env === 'ensemble' ? run.bnd.eLo : run.bnd.lLo, hi = st.env === 'ensemble' ? run.bnd.eHi : run.bnd.lHi;
        landscape(group, run, hi.map((v, f) => v - lo[f]), { prior: false });
      } else landscape(group, run, w, { prior: true });
    }
  } else if (view === 'status') {
    const stat = run.status;
    drawSupports(group, run, st, i => stat
      ? { color: new THREE.Color(STATUS_COLORS[stat.obs[i]]), dashed: stat.evidenceFail[i] === 1 }
      : { color: new THREE.Color(0xaaaaaa) });
    if (stat && st.sel >= 0 && d === 2) {
      const T = run.table;
      for (let f = T.start[st.sel]; f < T.start[st.sel + 1]; f++) tile(group, T.lo[f], T.hi[f], STATUS_COLORS[stat.frag[f]], 0.75, 0.02);
    }
  }

  if (st.truth) {
    const pts = [];
    const lb = new LineBuf(), gcol = new THREE.Color(0x333333);
    run.evalRec.xStar.forEach((x, i) => {
      const p = W(d, x, 0.03);
      pts.push(p.x, p.y, p.z);
      if (i === st.sel) { const o = obs[i]; lb.seg(p, W(d, o.lo.map((v, j) => (v + o.hi[j]) / 2), 0.03), gcol); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x111111, size: 0.06 })));
    flush(group, lb);
  }

  if (st.sel >= 0) {
    const lb = new LineBuf(), o = obs[st.sel];
    outline(lb, d, o.lo, o.hi, 0.02, new THREE.Color(0x000000));
    if (d === 2) outline(lb, d, o.lo0, o.hi0, 0.02, new THREE.Color(0x888888));
    flush(group, lb);
  }
  if (st.hl) {
    const lb = new LineBuf(), n = run.tree.nodes[run.tree.leaves[st.hl.leaf]];
    outline(lb, d, n.lo, n.hi, 0.03, new THREE.Color(0xD55E00));
    for (const a of st.hl.anchors) outline(lb, d, obs[a].lo, obs[a].hi, 0.03, new THREE.Color(0x222222));
    flush(group, lb);
  }
}

export function pickObs(run, raycaster) {
  if (!run) return -1;
  const d = run.prob.d, obs = run.prob.obs;
  if (d === 2) {
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return -1;
    const x = [p.x / S + 0.5, p.z / S + 0.5], tol = 0.01;
    let best = -1, ba = Infinity;
    obs.forEach((o, i) => {
      if (x[0] < o.lo[0] - tol || x[0] > o.hi[0] + tol || x[1] < o.lo[1] - tol || x[1] > o.hi[1] + tol) return;
      const a = Math.max(o.hi[0] - o.lo[0], 0.005) * Math.max(o.hi[1] - o.lo[1], 0.005);
      if (a < ba) { ba = a; best = i; }
    });
    return best;
  }
  let best = -1, bd = Infinity;
  const hit = new THREE.Vector3();
  obs.forEach((o, i) => {
    const b = new THREE.Box3(W(3, o.lo), W(3, o.hi));
    b.expandByScalar(0.03);
    if (raycaster.ray.intersectBox(b, hit)) {
      const dd = hit.distanceTo(raycaster.ray.origin);
      if (dd < bd) { bd = dd; best = i; }
    }
  });
  return best;
}