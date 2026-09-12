/**
 * WGSL kernels for GpuSolver — a stage-for-stage port of CpuSolver (§5). Velocity and vorticity are
 * vec4 buffers (xyz used), pressure has the same N+1 sentinel layout as the CPU, tracers are K×N floats.
 * Every kernel is order-independent (red-black SOR, gather stencils, atomicMax on positive-float bits),
 * so a run is deterministic on a given device.
 */
const COMMON = `
struct Sim {
  Nx: u32, Ny: u32, Nz: u32, N: u32,
  hx: f32, hy: f32, hz: f32, dt: f32,
  U0: f32, amp: f32, aDiff: f32, om: f32,
  per: u32, parabolic: u32, K: u32, reverse: u32,
  zsT: f32, idt: f32, diag: f32, invJ: f32,
  fAmp: f32, fK: f32, pad0: f32, pad1: f32,
};
struct Pass { dir: f32, color: u32, mode: u32, pad: u32, };
struct S3 { v: vec3f, lo: vec3f, hi: vec3f, };
@group(0) @binding(0) var<uniform> sim: Sim;
@group(0) @binding(1) var<uniform> pp: Pass; // 'pass' is a reserved word in WGSL
@group(0) @binding(2) var<storage, read> vel: array<vec4f>;
@group(0) @binding(3) var<storage, read> src: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> outv: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> mn: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> mx: array<vec4f>;
@group(0) @binding(7) var<storage, read> solid: array<u32>;
@group(0) @binding(8) var<storage, read_write> velrw: array<vec4f>;
@group(0) @binding(9) var<storage, read_write> p: array<f32>;
@group(0) @binding(10) var<storage, read_write> divb: array<f32>;
@group(0) @binding(11) var<storage, read> pNb: array<i32>;
@group(0) @binding(12) var<storage, read> pInv: array<f32>;
@group(0) @binding(13) var<storage, read_write> atom: array<atomic<u32>>;
@group(0) @binding(14) var<storage, read> tr: array<f32>;
@group(0) @binding(15) var<storage, read_write> trOut: array<f32>;
@group(0) @binding(16) var<storage, read> noise: array<f32>;
@group(0) @binding(17) var<storage, read_write> vort: array<vec4f>;
@group(0) @binding(18) var<storage, read_write> outlet: array<f32>;

fn ijk(n: u32) -> vec3i {
  let Nx = sim.Nx; let Ny = sim.Ny;
  return vec3i(i32(n % Nx), i32((n / Nx) % Ny), i32(n / (Nx * Ny)));
}
`;

/** Trilinear sample with ghost signs, mirroring CpuSolver.sample (min/max of the stencil for the MacCormack clamp). */
const sample = (name, buf) => `
fn ${name}(x: f32, y: f32, z: f32, zsv: vec3f, ysv: vec3f) -> S3 {
  let Nx = i32(sim.Nx); let Ny = i32(sim.Ny); let Nz = i32(sim.Nz);
  let sy = Nx; let sz = Nx * Ny;
  let fx = clamp(x - 0.5, 0.0, f32(Nx - 1));
  var fy = y - 0.5;
  let fz = clamp(z - 0.5, -0.5, f32(Nz) - 0.5);
  let i0 = min(i32(floor(fx)), Nx - 2); let tx = fx - f32(i0);
  let k0 = i32(floor(fz)); let tz = fz - f32(k0);
  var ka = k0; var kb = k0 + 1; var sa = vec3f(1.0); var sb = vec3f(1.0);
  if (ka < 0) { ka = 0; sa = zsv; }
  if (kb > Nz - 1) { kb = Nz - 1; sb = zsv; }
  var ja = 0; var jb = 0; var ra = vec3f(1.0); var rb = vec3f(1.0); var ty = 0.0;
  if (sim.per != 0u) {
    let j0 = i32(floor(fy)); ty = fy - f32(j0); ja = ((j0 % Ny) + Ny) % Ny; jb = ja + 1; if (jb == Ny) { jb = 0; }
  } else {
    fy = clamp(fy, -0.5, f32(Ny) - 0.5); let j0 = i32(floor(fy)); ty = fy - f32(j0); ja = j0; jb = j0 + 1;
    if (ja < 0) { ja = 0; ra = ysv; }
    if (jb > Ny - 1) { jb = Ny - 1; rb = ysv; }
  }
  let b00 = i0 + ja * sy + ka * sz; let b10 = i0 + jb * sy + ka * sz; let b01 = i0 + ja * sy + kb * sz; let b11 = i0 + jb * sy + kb * sz;
  let c000 = ${buf}[b00].xyz * ra * sa; let c100 = ${buf}[b00 + 1].xyz * ra * sa;
  let c010 = ${buf}[b10].xyz * rb * sa; let c110 = ${buf}[b10 + 1].xyz * rb * sa;
  let c001 = ${buf}[b01].xyz * ra * sb; let c101 = ${buf}[b01 + 1].xyz * ra * sb;
  let c011 = ${buf}[b11].xyz * rb * sb; let c111 = ${buf}[b11 + 1].xyz * rb * sb;
  let x00 = c000 + tx * (c100 - c000); let x10 = c010 + tx * (c110 - c010);
  let x01 = c001 + tx * (c101 - c001); let x11 = c011 + tx * (c111 - c011);
  let y0 = x00 + ty * (x10 - x00); let y1 = x01 + ty * (x11 - x01);
  var r: S3;
  r.v = y0 + tz * (y1 - y0);
  r.lo = min(min(min(c000, c100), min(c010, c110)), min(min(c001, c101), min(c011, c111)));
  r.hi = max(max(max(c000, c100), max(c010, c110)), max(max(c001, c101), max(c011, c111)));
  return r;
}`;

const KERNELS = `
/* ---- inlet / outlet rows (one thread per (j,k) row), mirrors applyBoundaries ---- */
@compute @workgroup_size(64) fn boundaries(@builtin(global_invocation_id) g: vec3u) {
  let t = g.x; let Ny = sim.Ny; let Nz = sim.Nz; if (t >= Ny * Nz) { return; }
  let j = t % Ny; let k = t / Ny; let Nx = sim.Nx; let N = sim.N;
  let i0 = j * Nx + k * Nx * Ny; let i1 = i0 + Nx - 1u;
  let z = (f32(k) + 0.5) / f32(Nz);
  let pr = select(1.0, 6.0 * z * (1.0 - z), sim.parabolic != 0u);
  let U = sim.U0; let dir = select(1.0, -1.0, sim.reverse != 0u); let c = sim.dt * U / sim.hx;
  velrw[i0] = vec4f(dir * U * pr, sim.amp * U * pr * noise[j + Ny * k], 0.0, 0.0);
  if (sim.reverse == 0u) { velrw[i1] = velrw[i1] - c * (velrw[i1] - velrw[i1 - 1u]); } else { velrw[i1] = vec4f(-U * pr, 0.0, 0.0, 0.0); }
  let band = (j * sim.K) / Ny;
  for (var ch = 0u; ch < sim.K; ch++) {
    let o = ch * N;
    trOut[o + i0] = select(0.0, 1.0, ch == band);
    if (sim.reverse == 0u) { trOut[o + i1] = trOut[o + i1] - c * (trOut[o + i1] - trOut[o + i1 - 1u]); }
  }
}

/* ---- semi-Lagrangian pass (mode=1: forward, records stencil min/max; mode=0: backward) ---- */
@compute @workgroup_size(64) fn advect(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  let c = ijk(n); let i = u32(c.x);
  if (i == 0u || i == sim.Nx - 1u) { outv[n] = src[n]; return; }
   if (solid[n] != 0u) { outv[n] = vec4f(0.0); if (pp.mode != 0u) { mn[n] = vec4f(0.0); mx[n] = vec4f(0.0); } return; }
  let zsv = vec3f(sim.zsT, sim.zsT, -1.0); let ysv = vec3f(1.0, -1.0, 1.0);
   let a = sim.dt * pp.dir / vec3f(sim.hx, sim.hy, sim.hz);
  let pos = vec3f(f32(c.x) + 0.5, f32(c.y) + 0.5, f32(c.z) + 0.5);
  let pm = pos - 0.5 * a * vel[n].xyz;
  let m = sampleVel(pm.x, pm.y, pm.z, zsv, ysv).v;
  let pb = pos - a * m;
  let s = sampleSrc(pb.x, pb.y, pb.z, zsv, ysv);
  outv[n] = vec4f(s.v, 0.0);
   if (pp.mode != 0u) { mn[n] = vec4f(s.lo, 0.0); mx[n] = vec4f(s.hi, 0.0); }
}

/* ---- clamped MacCormack: vel=u, src=ua (forward), outv=ub (backward, overwritten with the result) ---- */
@compute @workgroup_size(64) fn combine(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  let i = n % sim.Nx;
  if (i == 0u || i == sim.Nx - 1u) { outv[n] = vel[n]; return; }
  if (solid[n] != 0u) { outv[n] = vec4f(0.0); return; }
  let c = src[n].xyz + 0.5 * (vel[n].xyz - outv[n].xyz);
  outv[n] = vec4f(clamp(c, mn[n].xyz, mx[n].xyz), 0.0);
}

/* ---- all K tracer channels share one back-traced stencil (zero-gradient ghosts) ---- */
@compute @workgroup_size(64) fn advectTracers(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; let N = sim.N; if (n >= N) { return; }
  let Nx = i32(sim.Nx); let Ny = i32(sim.Ny); let Nz = i32(sim.Nz); let K = sim.K;
  let c = ijk(n); let i = c.x;
  if (i == 0 || i == Nx - 1) { for (var ch = 0u; ch < K; ch++) { trOut[ch * N + n] = tr[ch * N + n]; } return; }
  if (solid[n] != 0u) { for (var ch = 0u; ch < K; ch++) { trOut[ch * N + n] = 0.0; } return; }
  let zsv = vec3f(sim.zsT, sim.zsT, -1.0); let ysv = vec3f(1.0, -1.0, 1.0);
  let a = sim.dt / vec3f(sim.hx, sim.hy, sim.hz);
  let pos = vec3f(f32(c.x) + 0.5, f32(c.y) + 0.5, f32(c.z) + 0.5);
  let pm = pos - 0.5 * a * vel[n].xyz;
  let m = sampleVel(pm.x, pm.y, pm.z, zsv, ysv).v;
  var fx = pos.x - a.x * m.x - 0.5; var fy = pos.y - a.y * m.y - 0.5; var fz = pos.z - a.z * m.z - 0.5;
  fx = clamp(fx, 0.0, f32(Nx - 1)); fz = clamp(fz, 0.0, f32(Nz - 1));
  let i0 = min(i32(floor(fx)), Nx - 2); let k0 = min(i32(floor(fz)), Nz - 2);
  let tx = fx - f32(i0); let tz = fz - f32(k0);
  var ja = 0; var jb = 0; var ty = 0.0;
  if (sim.per != 0u) { let j0 = i32(floor(fy)); ty = fy - f32(j0); ja = ((j0 % Ny) + Ny) % Ny; jb = select(ja + 1, 0, ja == Ny - 1); }
  else { fy = clamp(fy, 0.0, f32(Ny - 1)); let j0 = min(i32(floor(fy)), Ny - 2); ty = fy - f32(j0); ja = j0; jb = j0 + 1; }
  let sy = Nx; let sz = Nx * Ny;
  let b00 = u32(i0 + ja * sy + k0 * sz); let b10 = u32(i0 + jb * sy + k0 * sz); let b01 = b00 + u32(sz); let b11 = b10 + u32(sz);
  for (var ch = 0u; ch < K; ch++) {
    let o = ch * N;
    let x00 = tr[o + b00] + tx * (tr[o + b00 + 1u] - tr[o + b00]); let x10 = tr[o + b10] + tx * (tr[o + b10 + 1u] - tr[o + b10]);
    let x01 = tr[o + b01] + tx * (tr[o + b01 + 1u] - tr[o + b01]); let x11 = tr[o + b11] + tx * (tr[o + b11 + 1u] - tr[o + b11]);
    let y0 = x00 + ty * (x10 - x00); let y1 = x01 + ty * (x11 - x01);
    trOut[o + n] = y0 + tz * (y1 - y0);
  }
}

/* ---- viscosity: neighbour sum over 'src' with ghost signs, mirrors _nbSum ---- */
fn nbSum(n: i32, j: i32, k: i32) -> vec3f {
  let Ny = i32(sim.Ny); let Nz = i32(sim.Nz); let sy = i32(sim.Nx); let sz = sy * Ny;
  let cx = 1.0 / (sim.hx * sim.hx); let cy = 1.0 / (sim.hy * sim.hy); let cz = 1.0 / (sim.hz * sim.hz);
  let zs = vec3f(sim.zsT, sim.zsT, -1.0); let ys = vec3f(1.0, -1.0, 1.0);
  let f = src[n].xyz;
  var s = cx * (src[n - 1].xyz + src[n + 1].xyz);
  var fm: vec3f; var fp: vec3f;
  if (sim.per != 0u) {
    fm = src[n + select(-sy, (Ny - 1) * sy, j == 0)].xyz;
    fp = src[n + select(sy, -(Ny - 1) * sy, j == Ny - 1)].xyz;
  } else {
    if (j == 0) { fm = ys * f; } else { fm = src[n - sy].xyz; }
    if (j == Ny - 1) { fp = ys * f; } else { fp = src[n + sy].xyz; }
  }
  s += cy * (fm + fp);
  var fb: vec3f; var ft: vec3f;
  if (k == 0) { fb = zs * f; } else { fb = src[n - sz].xyz; }
  if (k == Nz - 1) { ft = zs * f; } else { ft = src[n + sz].xyz; }
  return s + cz * (fb + ft);
}
@compute @workgroup_size(64) fn diffuse(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  let c = ijk(n);
  if (c.x == 0 || c.x == i32(sim.Nx) - 1 || solid[n] != 0u) { outv[n] = src[n]; return; }
  let f = src[n].xyz;
  outv[n] = vec4f(f + sim.aDiff * (nbSum(i32(n), c.y, c.z) - sim.diag * f), 0.0);
}
/* vel = rhs (velocity before diffusion), src = current iterate, outv = next iterate */
@compute @workgroup_size(64) fn jacobi(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  let c = ijk(n);
  if (c.x == 0 || c.x == i32(sim.Nx) - 1 || solid[n] != 0u) { outv[n] = vel[n]; return; }
  outv[n] = vec4f((vel[n].xyz + sim.aDiff * nbSum(i32(n), c.y, c.z)) * sim.invJ, 0.0);
}

@compute @workgroup_size(64) fn forces(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N || solid[n] != 0u) { return; }
  let c = ijk(n); let TAU = 6.283185307179586;
  velrw[n].x += sim.dt * sim.fAmp * sin(TAU * sim.fK * (f32(c.y) + 0.5) / f32(sim.Ny));
  velrw[n].y += sim.dt * sim.fAmp * sin(TAU * sim.fK * (f32(c.x) + 0.5) / f32(sim.Nx) * 2.0);
}

@compute @workgroup_size(64) fn divergence(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  let c = ijk(n); let i = c.x; let j = c.y; let k = c.z;
  let Nx = i32(sim.Nx); let Ny = i32(sim.Ny); let Nz = i32(sim.Nz); let sy = Nx; let sz = Nx * Ny; let m = i32(n);
  if (i == 0 || i == Nx - 1 || solid[n] != 0u) { divb[n] = 0.0; return; }
  let ix = 0.5 / sim.hx; let iy = 0.5 / sim.hy; let iz = 0.5 / sim.hz;
  let vc = vel[m];
  var vN: f32; var vS: f32; var wT: f32; var wB: f32;
  if (j == Ny - 1) { if (sim.per != 0u) { vN = vel[m - (Ny - 1) * sy].y; } else { vN = -vc.y; } } else { vN = vel[m + sy].y; }
  if (j == 0) { if (sim.per != 0u) { vS = vel[m + (Ny - 1) * sy].y; } else { vS = -vc.y; } } else { vS = vel[m - sy].y; }
  if (k == Nz - 1) { wT = -vc.z; } else { wT = vel[m + sz].z; }
  if (k == 0) { wB = -vc.z; } else { wB = vel[m - sz].z; }
  let d = (vel[m + 1].x - vel[m - 1].x) * ix + (vN - vS) * iy + (wT - wB) * iz;
  divb[n] = d;
  atomicMax(&atom[0], bitcast<u32>(abs(d)));
}

/* ---- one red-black SOR half-sweep over the gather table (same colouring as CpuSolver._pressure) ---- */
@compute @workgroup_size(64) fn sor(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  let Nx = sim.Nx; let Ny = sim.Ny;
  let i = n % Nx; let j = (n / Nx) % Ny; let k = n / (Nx * Ny);
   if (i == 0u || i == Nx - 1u || ((i + j + k + pp.color) & 1u) != 0u) { return; }
  let id = pInv[n]; if (id == 0.0) { return; }
  let m = 6u * n;
  let cx = 1.0 / (sim.hx * sim.hx); let cy = 1.0 / (sim.hy * sim.hy); let cz = 1.0 / (sim.hz * sim.hz);
  let s = cx * (p[pNb[m]] + p[pNb[m + 1u]]) + cy * (p[pNb[m + 2u]] + p[pNb[m + 3u]]) + cz * (p[pNb[m + 4u]] + p[pNb[m + 5u]]);
  let d = sim.om * ((s - divb[n] * sim.idt) * id - p[n]);
  p[n] += d;
  atomicMax(&atom[1], bitcast<u32>(abs(d)));
}

@compute @workgroup_size(64) fn project(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  let c = ijk(n); let i = c.x; let j = c.y; let k = c.z;
  let Nx = i32(sim.Nx); let Ny = i32(sim.Ny); let Nz = i32(sim.Nz); let sy = Nx; let sz = Nx * Ny; let m = i32(n);
  if (i == 0 || i == Nx - 1 || solid[n] != 0u) { return; }
  let pc = p[n];
  var pxm = pc; if (i > 1 && solid[m - 1] == 0u) { pxm = p[m - 1]; }
  var pxp = 0.0; if (i != Nx - 2) { if (solid[m + 1] == 0u) { pxp = p[m + 1]; } else { pxp = pc; } }
  var pym = pc; var pyp = pc;
  if (sim.per != 0u) {
    let jm = m + select(-sy, (Ny - 1) * sy, j == 0); let jp = m + select(sy, -(Ny - 1) * sy, j == Ny - 1);
    if (solid[jm] == 0u) { pym = p[jm]; }
    if (solid[jp] == 0u) { pyp = p[jp]; }
  } else {
    if (j > 0 && solid[m - sy] == 0u) { pym = p[m - sy]; }
    if (j < Ny - 1 && solid[m + sy] == 0u) { pyp = p[m + sy]; }
  }
  var pzm = pc; var pzp = pc;
  if (k > 0 && solid[m - sz] == 0u) { pzm = p[m - sz]; }
  if (k < Nz - 1 && solid[m + sz] == 0u) { pzp = p[m + sz]; }
  let h = sim.dt * 0.5;
  velrw[n] -= vec4f(h / sim.hx * (pxp - pxm), h / sim.hy * (pyp - pym), h / sim.hz * (pzp - pzm), 0.0);
}

@compute @workgroup_size(64) fn curl(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  if (solid[n] != 0u) { vort[n] = vec4f(0.0); return; }
  let c = ijk(n); let i = c.x; let j = c.y; let k = c.z;
  let Nx = i32(sim.Nx); let Ny = i32(sim.Ny); let Nz = i32(sim.Nz); let sy = Nx; let sz = Nx * Ny; let m = i32(n);
  let ix = 0.5 / sim.hx; let iy = 0.5 / sim.hy; let iz = 0.5 / sim.hz; let zs = sim.zsT;
  let vc = vel[m];
  var dvdx: f32; var dwdx: f32;
  if (i == 0) { dvdx = (vel[m + 1].y - vc.y) * 2.0 * ix; dwdx = (vel[m + 1].z - vc.z) * 2.0 * ix; }
  else if (i == Nx - 1) { dvdx = (vc.y - vel[m - 1].y) * 2.0 * ix; dwdx = (vc.z - vel[m - 1].z) * 2.0 * ix; }
  else { dvdx = (vel[m + 1].y - vel[m - 1].y) * ix; dwdx = (vel[m + 1].z - vel[m - 1].z) * ix; }
  var uN: f32; var uS: f32; var wN: f32; var wS: f32;
  if (sim.per != 0u) {
    let jp = m + select(sy, -(Ny - 1) * sy, j == Ny - 1); let jm = m + select(-sy, (Ny - 1) * sy, j == 0);
    uN = vel[jp].x; uS = vel[jm].x; wN = vel[jp].z; wS = vel[jm].z;
  } else {
    if (j == Ny - 1) { uN = vc.x; wN = vc.z; } else { uN = vel[m + sy].x; wN = vel[m + sy].z; }
    if (j == 0) { uS = vc.x; wS = vc.z; } else { uS = vel[m - sy].x; wS = vel[m - sy].z; }
  }
  var uT: f32; var uB: f32; var vT: f32; var vB: f32;
  if (k == Nz - 1) { uT = zs * vc.x; vT = zs * vc.y; } else { uT = vel[m + sz].x; vT = vel[m + sz].y; }
  if (k == 0) { uB = zs * vc.x; vB = zs * vc.y; } else { uB = vel[m - sz].x; vB = vel[m - sz].y; }
  let dudy = (uN - uS) * iy; let dwdy = (wN - wS) * iy; let dudz = (uT - uB) * iz; let dvdz = (vT - vB) * iz;
  vort[n] = vec4f(dwdy - dvdz, dudz - dwdx, dvdx - dudy, 0.0);
}

/* ---- helpers used outside step(): outlet plane for Î, solid zeroing, twin perturb/renormalize, rewind negate ---- */
@compute @workgroup_size(64) fn gatherOutlet(@builtin(global_invocation_id) g: vec3u) {
  let t = g.x; let M = sim.Ny * sim.Nz; if (t >= sim.K * M) { return; }
  let c = t / M; let r = t % M; let j = r % sim.Ny; let k = r / sim.Ny;
  outlet[t] = tr[c * sim.N + (sim.Nx - 2u) + j * sim.Nx + k * sim.Nx * sim.Ny];
}
@compute @workgroup_size(64) fn zeroSolid(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N || solid[n] == 0u) { return; }
  velrw[n] = vec4f(0.0); p[n] = 0.0;
  for (var ch = 0u; ch < sim.K; ch++) { trOut[ch * sim.N + n] = 0.0; }
}
@compute @workgroup_size(64) fn addVel(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
  velrw[n] += src[n];
}
@compute @workgroup_size(64) fn blend(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
   velrw[n] = src[n] + pp.dir * (velrw[n] - src[n]);
}
@compute @workgroup_size(64) fn scaleVel(@builtin(global_invocation_id) g: vec3u) {
  let n = g.x; if (n >= sim.N) { return; }
   velrw[n] *= pp.dir;
}
`;

export const WGSL = COMMON + sample('sampleVel', 'vel') + sample('sampleSrc', 'src') + KERNELS;