const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const W = cv.width,
  H = cv.height;

// World coordinate ranges. We map t (x) and f (y) into pixel space.
const T_MIN = -0.15,
  T_MAX = 1.15;
const F_MIN = -0.6,
  F_MAX = 1.6;
const PAD = 50;

// Control points for a PARAMETRIC spline [x(u), y(u)]:
//   { u, x, y, mx, my }
// u is the abstract path parameter (independent of x). Each coordinate
// is its own cubic Hermite function of u, so the curve may fold/loop.
let controlPoints = [];

// ---- coordinate mapping ----
// These map WORLD x and WORLD y into pixel space.
const tx = (x) => PAD + ((x - T_MIN) / (T_MAX - T_MIN)) * (W - 2 * PAD);
const fy = (y) => H - PAD - ((y - F_MIN) / (F_MAX - F_MIN)) * (H - 2 * PAD);
const inv_x = (px) => T_MIN + ((px - PAD) / (W - 2 * PAD)) * (T_MAX - T_MIN);
const inv_y = (py) => F_MIN + ((H - PAD - py) / (H - 2 * PAD)) * (F_MAX - F_MIN);

// ---- random tangent in t-units ----
const randTangent = () => (Math.random() * 2 - 1) * 2.5;

function reset() {
  controlPoints = [
    { u: 0, x: 0, y: 1, mx: randTangent(), my: randTangent() },
    { u: 1, x: 1, y: 0, mx: randTangent(), my: randTangent() },
  ];
  draw();
}

function randomizeTangents() {
  controlPoints.forEach((cp) => {
    cp.mx = randTangent();
    cp.my = randTangent();
  });
  draw();
}

// ---- Hermite basis ----
const h00 = (s) => 2 * s * s * s - 3 * s * s + 1;
const h10 = (s) => s * s * s - 2 * s * s + s;
const h01 = (s) => -2 * s * s * s + 3 * s * s;
const h11 = (s) => s * s * s - s * s;

// ---- derivatives of basis (w.r.t s) ----
const dh00 = (s) => 6 * s * s - 6 * s;
const dh10 = (s) => 3 * s * s - 4 * s + 1;
const dh01 = (s) => -6 * s * s + 6 * s;
const dh11 = (s) => 3 * s * s - 2 * s;

// Apply the upstream/downstream symmetry correction (parity alignment).
// The curve is PARAMETRIC, so a tangent is the vector (mx, my) and the
// segment's "current" is the secant VECTOR (dx, dy). We reflect the whole
// tangent vector if it points backward relative to the secant, i.e. when
// their dot product is negative. This is the correct 2D analog of the 1D
// sign(m) != sign(delta) rule -- aligning each axis independently is wrong
// because it can produce a tangent unrelated to the actual path direction.
function alignTangentVec(mx, my, dx, dy) {
  const dot = mx * dx + my * dy;
  const secLen2 = dx * dx + dy * dy;
  if (secLen2 > 1e-18 && dot < 0) {
    return { mx: -mx, my: -my, reflected: true };
  }
  return { mx, my, reflected: false };
}

// Evaluate ONE coordinate (Hermite) on a segment, given endpoint values
// p0,p1 and endpoint tangents m0,m1, at local parameter s in [0,1].
function hermite(p0, m0, p1, m1, h, s) {
  return h00(s) * p0 + h10(s) * h * m0 + h01(s) * p1 + h11(s) * h * m1;
}

// Evaluate a parametric segment between cp0 and cp1 at path param u.
// Returns { x, y }. Parity alignment is applied independently per axis
// against that axis's secant.
function evalSegment(cp0, cp1, u, useRaw) {
  const h = cp1.u - cp0.u;
  const s = (u - cp0.u) / h;
  const dx = (cp1.x - cp0.x) / h;
  const dy = (cp1.y - cp0.y) / h;
  let mx0 = cp0.mx,
    mx1 = cp1.mx,
    my0 = cp0.my,
    my1 = cp1.my;
  if (!useRaw) {
    const a0 = alignTangentVec(cp0.mx, cp0.my, dx, dy);
    const a1 = alignTangentVec(cp1.mx, cp1.my, dx, dy);
    mx0 = a0.mx;
    my0 = a0.my;
    mx1 = a1.mx;
    my1 = a1.my;
  }
  return {
    x: hermite(cp0.x, mx0, cp1.x, mx1, h, s),
    y: hermite(cp0.y, my0, cp1.y, my1, h, s),
  };
}

// Stationary points in 2D: where the y-component has dy/du = 0
// (i.e. the curve is locally horizontal -> vertical extrema). Returns
// array of {x, y}. Swap the p/m arguments to detect vertical tangents.
function segmentStationary(cp0, cp1, useRaw) {
  const h = cp1.u - cp0.u;
  const dx = (cp1.x - cp0.x) / h;
  const dy = (cp1.y - cp0.y) / h;
  let m0 = cp0.my,
    m1 = cp1.my;
  if (!useRaw) {
    // Use the SAME vector reflection as evalSegment so the y-tangents
    // here are consistent with the rendered curve.
    m0 = alignTangentVec(cp0.mx, cp0.my, dx, dy).my;
    m1 = alignTangentVec(cp1.mx, cp1.my, dx, dy).my;
  }
  const p0 = cp0.y,
    p1 = cp1.y;
  // y'(s) quadratic a*s^2 + b*s + c
  const a = 6 * p0 + 3 * h * m0 - 6 * p1 + 3 * h * m1;
  const b = -6 * p0 - 4 * h * m0 + 6 * p1 - 2 * h * m1;
  const c = h * m0;
  const roots = [];
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      roots.push((-b + sq) / (2 * a));
      roots.push((-b - sq) / (2 * a));
    }
  }
  const out = [];
  for (const s of roots) {
    if (s >= 0 && s <= 1) {
      const u = cp0.u + s * h;
      out.push(evalSegment(cp0, cp1, u, useRaw));
    }
  }
  return out;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const useRaw = document.getElementById('showRaw').checked;
  const showStat = document.getElementById('showStat').checked;

  drawGrid();

  const sorted = [...controlPoints].sort((a, b) => a.u - b.u);

  // ---- draw spline curve, segment by segment ----
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#4fc3f7';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < sorted.length - 1; i++) {
    const cp0 = sorted[i],
      cp1 = sorted[i + 1];
    const steps = 60;
    for (let k = 0; k <= steps; k++) {
      const u = cp0.u + (cp1.u - cp0.u) * (k / steps);
      const p = evalSegment(cp0, cp1, u, useRaw);
      const px = tx(p.x),
        py = fy(p.y);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  // ---- draw tangents ----
  for (const cp of sorted) {
    // Determine reflection state by looking at adjacent segment secant
    // VECTOR against the whole tangent vector, matching evalSegment exactly.
    let reflected = false;
    let drawMx = cp.mx;
    let drawMy = cp.my;
    if (!useRaw) {
      const idx = sorted.indexOf(cp);
      let dx = null,
        dy = null;
      if (idx < sorted.length - 1) {
        const nb = sorted[idx + 1];
        dx = (nb.x - cp.x) / (nb.u - cp.u);
        dy = (nb.y - cp.y) / (nb.u - cp.u);
      } else if (idx > 0) {
        const nb = sorted[idx - 1];
        dx = (cp.x - nb.x) / (cp.u - nb.u);
        dy = (cp.y - nb.y) / (cp.u - nb.u);
      }
      if (dx !== null) {
        const a = alignTangentVec(cp.mx, cp.my, dx, dy);
        drawMx = a.mx;
        drawMy = a.my;
        reflected = a.reflected;
      }
    }
    drawTangent(cp.x, cp.y, drawMx, drawMy, reflected);
  }

  // ---- draw stationary points ----
  if (showStat) {
    ctx.fillStyle = '#ffd54f';
    for (let i = 0; i < sorted.length - 1; i++) {
      const pts = segmentStationary(sorted[i], sorted[i + 1], useRaw);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(tx(p.x), fy(p.y), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- draw control points ----
  for (const cp of sorted) {
    const px = tx(cp.x),
      py = fy(cp.y);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f3460';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  updateList(sorted, useRaw);
}

// tangent drawn as a short line segment with slope m (in t,f units)
// The curve is parametric, so its direction is (mx, my) = (dx/du, dy/du).
// We draw a short segment along that normalized direction so the tangent
// visually aligns with the rendered spline.
function drawTangent(x, y, mx, my, reflected) {
  const dt = 0.09;
  let dirx = mx,
    diry = my;
  const len = Math.hypot(dirx, diry) || 1;
  dirx /= len;
  diry /= len;
  const x0 = x - dt * dirx,
    x1 = x + dt * dirx;
  const y0 = y - dt * diry,
    y1 = y + dt * diry;
  ctx.lineWidth = 2;
  ctx.strokeStyle = reflected ? '#ff7043' : '#66bb6a';
  ctx.beginPath();
  ctx.moveTo(tx(x0), fy(y0));
  ctx.lineTo(tx(x1), fy(y1));
  ctx.stroke();
  // little arrowheads
  ctx.fillStyle = reflected ? '#ff7043' : '#66bb6a';
  for (const [xx, yy] of [
    [x1, y1],
    [x0, y0],
  ]) {
    ctx.beginPath();
    ctx.arc(tx(xx), fy(yy), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrid() {
  ctx.strokeStyle = '#0f346088';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#7e8aa0';
  ctx.font = '11px monospace';
  // vertical t gridlines
  for (let t = 0; t <= 1.0001; t += 0.25) {
    const px = tx(t);
    ctx.beginPath();
    ctx.moveTo(px, PAD);
    ctx.lineTo(px, H - PAD);
    ctx.stroke();
    ctx.fillText('t=' + t.toFixed(2), px - 14, H - PAD + 16);
  }
  // horizontal f gridlines
  for (let f = -0.5; f <= 1.5001; f += 0.5) {
    const py = fy(f);
    ctx.beginPath();
    ctx.moveTo(PAD, py);
    ctx.lineTo(W - PAD, py);
    ctx.stroke();
    ctx.fillText('f=' + f.toFixed(1), 6, py + 4);
  }
  // axis labels
  ctx.fillStyle = '#4fc3f7';
  ctx.font = '13px sans-serif';
  ctx.fillText('path parameter t →', W - 170, H - 18);
}

function updateList(sorted, useRaw) {
  const el = document.getElementById('cpList');
  el.innerHTML = '';
  for (let i = 0; i < sorted.length; i++) {
    const cp = sorted[i];
    // determine reflection wrt adjacent segment
    let reflected = false;
    if (!useRaw) {
      let dx = null,
        dy = null;
      if (i < sorted.length - 1) {
        dx = (sorted[i + 1].x - cp.x) / (sorted[i + 1].u - cp.u);
        dy = (sorted[i + 1].y - cp.y) / (sorted[i + 1].u - cp.u);
      } else if (i > 0) {
        dx = (cp.x - sorted[i - 1].x) / (cp.u - sorted[i - 1].u);
        dy = (cp.y - sorted[i - 1].y) / (cp.u - sorted[i - 1].u);
      }
      if (dx !== null) reflected = alignTangentVec(cp.mx, cp.my, dx, dy).reflected;
    }
    const row = document.createElement('div');
    row.className = 'cp-row';
    const tag = reflected ? ' <span class="reflected">(reflected)</span>' : '';
    row.innerHTML =
      `#${i}: u=${cp.u.toFixed(3)} (x=${cp.x.toFixed(3)}, ` +
      `y=${cp.y.toFixed(3)}, mx=${cp.mx.toFixed(3)}, ` +
      `my=${cp.my.toFixed(3)})${tag}`;
    el.appendChild(row);
  }
}

// ---- click handling: find nearest point ON the curve and add control point ----
cv.addEventListener('click', (e) => {
  const rect = cv.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (cv.width / rect.width);
  const py = (e.clientY - rect.top) * (cv.height / rect.height);
  const useRaw = document.getElementById('showRaw').checked;

  const sorted = [...controlPoints].sort((a, b) => a.u - b.u);

  // Densely scan the parametric curve to find the nearest point (in pixel
  // space) to the click, recording which segment and the path param u.
  let best = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const cp0 = sorted[i],
      cp1 = sorted[i + 1];
    const steps = 120;
    for (let k = 0; k <= steps; k++) {
      const u = cp0.u + (cp1.u - cp0.u) * (k / steps);
      const p = evalSegment(cp0, cp1, u, useRaw);
      const dx = tx(p.x) - px,
        dy = fy(p.y) - py;
      const d2 = dx * dx + dy * dy;
      if (!best || d2 < best.d2) best = { d2, u, x: p.x, y: p.y, i };
    }
  }
  if (!best) return;
  // ignore clicks that aren't reasonably close to the curve
  if (best.d2 > 30 * 30) return;

  controlPoints.push({
    u: best.u,
    x: best.x,
    y: best.y,
    mx: randTangent(),
    my: randTangent(),
  });
  draw();
});

document.getElementById('reset').onclick = reset;
document.getElementById('randomize').onclick = randomizeTangents;
document.getElementById('showRaw').onchange = draw;
document.getElementById('showStat').onchange = draw;

reset();
