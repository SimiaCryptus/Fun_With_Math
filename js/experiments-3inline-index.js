import { NoThreeInLine } from './no-three-in-line.js';

const els = {
  loading: document.getElementById('loading'),
  canvas: document.getElementById('canvas'),
  controls: document.getElementById('controls'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  btnPlay: document.getElementById('btnPlay'),
  btnStep: document.getElementById('btnStep'),
  btnRestart: document.getElementById('btnRestart'),
  rN: document.getElementById('rN'),
  rK: document.getElementById('rK'),
  selOpt: document.getElementById('selOpt'),
  rLr: document.getElementById('rLr'),
  selAngle: document.getElementById('selAngle'),
  rSharp: document.getElementById('rSharp'),
  cInvert: document.getElementById('cInvert'),
  rEps: document.getElementById('rEps'),
  rGrid: document.getElementById('rGrid'),
  rLine: document.getElementById('rLine'),
  rRepel: document.getElementById('rRepel'),
  rRepelR: document.getElementById('rRepelR'),
  rNoise: document.getElementById('rNoise'),
  cAnneal: document.getElementById('cAnneal'),
  cMode3d: document.getElementById('cMode3d'),
  vN: document.getElementById('vN'),
  vK: document.getElementById('vK'),
  vLr: document.getElementById('vLr'),
  vSharp: document.getElementById('vSharp'),
  vEps: document.getElementById('vEps'),
  vGrid: document.getElementById('vGrid'),
  vLine: document.getElementById('vLine'),
  vRepel: document.getElementById('vRepel'),
  vRepelR: document.getElementById('vRepelR'),
  vNoise: document.getElementById('vNoise'),
  mStep: document.getElementById('mStep'),
  mEnergy: document.getElementById('mEnergy'),
  mLines: document.getElementById('mLines'),
  mViol: document.getElementById('mViol'),
  mValid: document.getElementById('mValid'),
  mBest: document.getElementById('mBest'),
};

const ctx = els.canvas.getContext('2d');
let solver = null;
let isTraining = false;
let bestValid = 0;
// Match the canvas backing-store resolution to its on-screen (CSS) size,
// scaled by devicePixelRatio, so the lattice is crisp instead of being
// stretched from a fixed 600×600 buffer.
function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const dpr = window.devicePixelRatio || 1;
  // The canvas is square (aspect-ratio 1/1); use the smaller side.
  const size = Math.round(Math.min(rect.width, rect.height) * dpr);
  if (els.canvas.width !== size || els.canvas.height !== size) {
    els.canvas.width = size;
    els.canvas.height = size;
  }
}
// Orbit camera state for 3D rendering.
const cam = {
  yaw: -0.6,
  pitch: -0.5,
  distance: 3.2,
};
// Drag state for manual point editing.
const drag = {
  active: false,
  index: -1,
  wasTraining: false,
  orbit: false,
  lastX: 0,
  lastY: 0,
};

function readParams() {
  return {
    n: parseInt(els.rN.value),
    k: parseInt(els.rK.value),
    dim: els.cMode3d.checked ? 3 : 2,
    optimizerType: els.selOpt.value,
    lr: parseFloat(els.rLr.value),
    angleFn: els.selAngle.value,
    angleSharp: parseFloat(els.rSharp.value),
    angleInvert: els.cInvert.checked,
    angleEps: parseFloat(els.rEps.value),
    lambdaGrid: parseFloat(els.rGrid.value),
    lambdaLine: parseFloat(els.rLine.value),
    lambdaRepel: parseFloat(els.rRepel.value),
    repelRadius: parseFloat(els.rRepelR.value),
    noise: parseFloat(els.rNoise.value),
    anneal: els.cAnneal.checked,
    autoRescale: true,
  };
}

function restart() {
  if (solver) solver.dispose();
  bestValid = 0;
  els.mBest.textContent = '0';
  solver = new NoThreeInLine(readParams());
}

function syncLabels() {
  els.vN.textContent = els.rN.value;
  els.vK.textContent = els.rK.value;
  els.vLr.textContent = parseFloat(els.rLr.value).toFixed(3);
  els.vSharp.textContent = parseFloat(els.rSharp.value).toFixed(2);
  els.vEps.textContent = parseFloat(els.rEps.value).toFixed(4);
  els.vGrid.textContent = parseFloat(els.rGrid.value).toFixed(2);
  els.vLine.textContent = parseFloat(els.rLine.value).toFixed(2);
  els.vRepel.textContent = parseFloat(els.rRepel.value).toFixed(2);
  els.vRepelR.textContent = parseFloat(els.rRepelR.value).toFixed(2);
  els.vNoise.textContent = parseFloat(els.rNoise.value).toFixed(3);
}

function colorForPop(p) {
  // p < 2 cool blue, p == 2 green, p > 2 hot red
  if (p <= 2) {
    const t = Math.max(0, Math.min(1, p / 2)); // 0..1
    // blue -> green
    const r = Math.round(88 + (63 - 88) * t);
    const g = Math.round(166 + (185 - 166) * t);
    const b = Math.round(255 + (80 - 255) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = Math.max(0, Math.min(1, (p - 2) / 2));
    const r = Math.round(63 + (248 - 63) * t);
    const g = Math.round(185 + (81 - 185) * t);
    const b = Math.round(80 + (73 - 80) * t);
    return `rgb(${r},${g},${b})`;
  }
}

function draw() {
  if (!solver) return;
  if (solver.params.dim === 3) {
    draw3d();
    return;
  }
  const n = solver.params.n;
  const W = els.canvas.width;
  const pad = 30;
  const cell = (W - 2 * pad) / (n - 1 || 1);
  const toPx = (c) => pad + c * cell;

  ctx.clearRect(0, 0, W, W);

  // grid
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(toPx(i), toPx(0));
    ctx.lineTo(toPx(i), toPx(n - 1));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toPx(0), toPx(i));
    ctx.lineTo(toPx(n - 1), toPx(i));
    ctx.stroke();
  }
  // lattice dots
  ctx.fillStyle = '#30363d';
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.beginPath();
      ctx.arc(toPx(i), toPx(j), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const viz = solver.getViz();

  // tracked lines, colored by population
  ctx.lineWidth = 2;
  for (const line of viz.lines) {
    ctx.strokeStyle = colorForPop(line.pop);
    ctx.globalAlpha = Math.min(0.7, 0.2 + Math.abs(line.pop - 2) * 0.3);
    // draw line segment clipped to grid via two far endpoints
    const { a, b, c } = line; // a*x + b*y = c (normalized)
    const pts = clipLine(a, b, c, 0, n - 1, 0, n - 1);
    if (pts) {
      ctx.beginPath();
      ctx.moveTo(toPx(pts[0].x), toPx(pts[0].y));
      ctx.lineTo(toPx(pts[1].x), toPx(pts[1].y));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // points
  for (const p of viz.points) {
    ctx.fillStyle = '#f0f6fc';
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toPx(p.x), toPx(p.y), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function clipLine(a, b, c, xmin, xmax, ymin, ymax) {
  // line: a*x + b*y = c
  const pts = [];
  const eps = 1e-9;
  if (Math.abs(b) > eps) {
    const y0 = (c - a * xmin) / b;
    if (y0 >= ymin - eps && y0 <= ymax + eps) pts.push({ x: xmin, y: y0 });
    const y1 = (c - a * xmax) / b;
    if (y1 >= ymin - eps && y1 <= ymax + eps) pts.push({ x: xmax, y: y1 });
  }
  if (Math.abs(a) > eps) {
    const x0 = (c - b * ymin) / a;
    if (x0 >= xmin - eps && x0 <= xmax + eps) pts.push({ x: x0, y: ymin });
    const x1 = (c - b * ymax) / a;
    if (x1 >= xmin - eps && x1 <= xmax + eps) pts.push({ x: x1, y: ymax });
  }
  if (pts.length >= 2) return [pts[0], pts[1]];
  return null;
}

// --- 3D rendering -----------------------------------------------------
// Project a lattice coordinate (0..n-1)^3 into canvas pixels using a
// simple orbit camera + perspective projection. Returns {sx, sy, depth}.
function project3d(gx, gy, gz) {
  const n = solver.params.n;
  const W = els.canvas.width;
  const half = (n - 1) / 2;
  // Center the cube at the origin, normalize to roughly unit scale.
  const s = 1 / Math.max(1, n - 1);
  let x = (gx - half) * s;
  let y = (gy - half) * s;
  let z = (gz - half) * s;
  // Rotate around Y (yaw) then X (pitch).
  const cy = Math.cos(cam.yaw),
    sy = Math.sin(cam.yaw);
  let x1 = cy * x + sy * z;
  let z1 = -sy * x + cy * z;
  const cp = Math.cos(cam.pitch),
    sp = Math.sin(cam.pitch);
  let y2 = cp * y - sp * z1;
  let z2 = sp * y + cp * z1;
  // Perspective: move camera back along z.
  const dist = cam.distance;
  const f = 1.8; // focal length
  const denom = dist - z2;
  const scale = (W * 0.42 * f) / (denom <= 0.1 ? 0.1 : denom);
  return {
    sx: W / 2 + x1 * scale,
    sy: W / 2 + y2 * scale,
    depth: z2,
    scale,
  };
}

function draw3d() {
  const n = solver.params.n;
  const W = els.canvas.width;
  ctx.clearRect(0, 0, W, W);
  // Cube corner coordinates (8 corners) and the 12 edges between them.
  const m = n - 1;
  const corners = [
    [0, 0, 0],
    [m, 0, 0],
    [m, m, 0],
    [0, m, 0],
    [0, 0, m],
    [m, 0, m],
    [m, m, m],
    [0, m, m],
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const pc = corners.map(([x, y, z]) => project3d(x, y, z));
  // Draw bounding cube edges.
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  for (const [a, b] of edges) {
    ctx.beginPath();
    ctx.moveTo(pc[a].sx, pc[a].sy);
    ctx.lineTo(pc[b].sx, pc[b].sy);
    ctx.stroke();
  }
  // Light grid lines on the three back faces (sparse for clarity).
  ctx.strokeStyle = '#21262d';
  for (let i = 0; i <= m; i++) {
    // floor grid (y = 0 plane)
    const a = project3d(i, 0, 0);
    const b = project3d(i, 0, m);
    const c = project3d(0, 0, i);
    const d = project3d(m, 0, i);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.sx, c.sy);
    ctx.lineTo(d.sx, d.sy);
    ctx.stroke();
  }
  const viz = solver.getViz();
  // Sort points back-to-front so nearer points draw on top.
  const projected = viz.points.map((p, i) => {
    const pr = project3d(p.x, p.y, p.z);
    return { ...pr, i };
  });
  projected.sort((a, b) => a.depth - b.depth);
  for (const p of projected) {
    // Radius scales gently with depth for a sense of 3D.
    const r = Math.max(3, 6 * (p.scale / ((W * 0.42 * 1.8) / cam.distance)));
    ctx.fillStyle = '#f0f6fc';
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// Geometry helpers shared by drawing and mouse interaction.
function gridGeometry() {
  const n = solver ? solver.params.n : 1;
  const W = els.canvas.width;
  const pad = 30;
  const cell = (W - 2 * pad) / (n - 1 || 1);
  return { n, W, pad, cell };
}

// Convert a canvas mouse event to grid coordinates.
function eventToGrid(evt) {
  const rect = els.canvas.getBoundingClientRect();
  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;
  const source = evt.touches && evt.touches.length ? evt.touches[0] : evt;
  const px = (source.clientX - rect.left) * scaleX;
  const py = (source.clientY - rect.top) * scaleY;
  const { pad, cell } = gridGeometry();
  return {
    gx: (px - pad) / cell,
    gy: (py - pad) / cell,
    px,
    py,
  };
}

// Find the nearest point within a pixel hit radius; -1 if none.
function pickPoint(px, py) {
  if (!solver) return -1;
  const { pad, cell } = gridGeometry();
  const pts = solver.getPoints();
  let best = -1;
  let bestDist = 12; // hit radius in pixels
  for (let i = 0; i < pts.length; i++) {
    const cx = pad + pts[i][0] * cell;
    const cy = pad + pts[i][1] * cell;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function updateMetrics() {
  if (!solver) return;
  const m = solver.metrics;
  els.mStep.textContent = m.step;
  els.mEnergy.textContent = m.energy.toFixed(4);
  els.mLines.textContent = m.numLines;
  els.mViol.textContent = m.violating;
  els.mViol.parentElement.querySelector('.m-val').className =
    'm-val ' + (m.violating > 0 ? 'bad' : 'ok');
  els.mValid.textContent = m.validPoints;
  if (m.validPoints > bestValid) {
    bestValid = m.validPoints;
    els.mBest.textContent = bestValid;
  }
}

function animate() {
  resizeCanvas();
  if (isTraining && solver) {
    for (let i = 0; i < 3; i++) solver.step();
    updateMetrics();
  }
  draw();
  requestAnimationFrame(animate);
}

function setupEvents() {
  // Collapsible sidebar toggle.
  els.sidebarToggle.onclick = () => {
    const collapsed = els.controls.classList.toggle('collapsed');
    els.sidebarToggle.textContent = collapsed ? '⚙ Show Controls' : '⚙ Hide Controls';
  };
  els.btnPlay.onclick = () => {
    isTraining = !isTraining;
    els.btnPlay.textContent = isTraining ? '⏸ Pause' : '▶ Play';
  };
  els.btnStep.onclick = () => {
    if (solver) {
      solver.step();
      updateMetrics();
    }
  };
  els.btnRestart.onclick = () => {
    restart();
    updateMetrics();
  };

  const liveParams = [
    'rLr',
    'selAngle',
    'rSharp',
    'cInvert',
    'rEps',
    'rGrid',
    'rLine',
    'rRepel',
    'rRepelR',
    'rNoise',
    'selOpt',
    'cAnneal',
  ];
  liveParams.forEach((id) => {
    els[id].addEventListener('input', () => {
      syncLabels();
      if (solver) solver.updateParams(readParams());
    });
  });
  // n and k require restart
  ['rN', 'rK', 'cMode3d'].forEach((id) => {
    els[id].addEventListener('input', () => {
      syncLabels();
      restart();
      updateMetrics();
    });
  });
  els.cMode3d.addEventListener('change', () => {
    restart();
    updateMetrics();
  });
  // Manual drag-to-edit point positions.
  const onDragStart = (evt) => {
    if (!solver) return;
    // In 3D mode, dragging orbits the camera instead of moving points.
    if (solver.params.dim === 3) {
      const { px, py } = eventToGrid(evt);
      evt.preventDefault();
      drag.active = true;
      drag.orbit = true;
      drag.lastX = px;
      drag.lastY = py;
      els.canvas.style.cursor = 'grabbing';
      return;
    }
    const { px, py } = eventToGrid(evt);
    const idx = pickPoint(px, py);
    if (idx < 0) return;
    evt.preventDefault();
    drag.active = true;
    drag.orbit = false;
    drag.index = idx;
    drag.wasTraining = isTraining;
    // Auto-pause while dragging.
    if (isTraining) {
      isTraining = false;
      els.btnPlay.textContent = '▶ Play';
    }
    els.canvas.style.cursor = 'grabbing';
  };
  const onDragMove = (evt) => {
    if (!solver) return;
    if (drag.active && drag.orbit) {
      // Orbit camera by mouse delta.
      evt.preventDefault();
      const { px, py } = eventToGrid(evt);
      cam.yaw += (px - drag.lastX) * 0.01;
      cam.pitch += (py - drag.lastY) * 0.01;
      cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch));
      drag.lastX = px;
      drag.lastY = py;
      draw();
      return;
    }
    if (!drag.active) {
      if (solver.params.dim === 3) {
        els.canvas.style.cursor = 'grab';
        return;
      }
      // Hover feedback: show grab cursor over a point.
      const { px, py } = eventToGrid(evt);
      els.canvas.style.cursor = pickPoint(px, py) >= 0 ? 'grab' : 'default';
      return;
    }
    evt.preventDefault();
    const { gx, gy } = eventToGrid(evt);
    solver.setPoint(drag.index, gx, gy);
    updateMetrics();
    draw();
  };
  const onDragEnd = () => {
    if (!drag.active) return;
    drag.active = false;
    if (drag.orbit) {
      drag.orbit = false;
      els.canvas.style.cursor = 'grab';
      return;
    }
    drag.index = -1;
    els.canvas.style.cursor = 'default';
    // Auto-resume if optimization was running before drag.
    if (drag.wasTraining) {
      isTraining = true;
      els.btnPlay.textContent = '⏸ Pause';
    }
    drag.wasTraining = false;
  };
  els.canvas.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  els.canvas.addEventListener('touchstart', onDragStart, { passive: false });
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);
  // Wheel zoom for the 3D orbit camera.
  els.canvas.addEventListener(
    'wheel',
    (evt) => {
      if (!solver || solver.params.dim !== 3) return;
      evt.preventDefault();
      cam.distance *= evt.deltaY > 0 ? 1.08 : 0.92;
      cam.distance = Math.max(1.5, Math.min(8, cam.distance));
      draw();
    },
    { passive: false }
  );
  // Keep the backing store in sync with layout changes.
  window.addEventListener('resize', () => {
    resizeCanvas();
    draw();
  });
}

async function init() {
  try {
    await tf.ready();
    els.loading.classList.add('hidden');
    syncLabels();
    resizeCanvas();
    setupEvents();
    restart();
    updateMetrics();
    animate();
  } catch (err) {
    console.error(err);
    els.loading.innerHTML = `<div style="color:var(--danger)">Error: ${err.message}</div>`;
  }
}

init();
