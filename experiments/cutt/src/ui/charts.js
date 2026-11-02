// Canvas 2D charts.
export function plotXY(cv, series, o = {}) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 30;
  ctx.clearRect(0, 0, W, H);
  ctx.font = '10px system-ui';
  const xs = [], ys = [];
  for (const s of series) for (const p of s.pts) if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
  if (!xs.length) { ctx.fillStyle = '#999'; ctx.fillText(o.empty || 'no data', 10, 20); return; }
  let x0 = o.x0 ?? Math.min(...xs), x1 = o.x1 ?? Math.max(...xs), y0 = o.y0 ?? Math.min(...ys), y1 = o.y1 ?? Math.max(...ys);
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) y1 = y0 + 1;
  const X = v => pad + (v - x0) / (x1 - x0) * (W - pad - 8), Y = v => H - pad + 8 - (v - y0) / (y1 - y0) * (H - pad - 4);
  ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(pad, 4); ctx.lineTo(pad, H - pad + 8); ctx.lineTo(W - 4, H - pad + 8); ctx.stroke();
  ctx.fillStyle = '#555';
  ctx.fillText(x0.toPrecision(2), pad, H - 10); ctx.fillText(x1.toPrecision(2), W - 34, H - 10);
  ctx.fillText(y1.toPrecision(2), 2, 12); ctx.fillText(y0.toPrecision(2), 2, H - pad + 8);
  if (o.xlabel) ctx.fillText(o.xlabel, W / 2 - 30, H - 2);
  series.forEach((s, k) => {
    ctx.strokeStyle = ctx.fillStyle = s.color;
    if (s.mode === 'line') {
      ctx.beginPath();
      s.pts.forEach((p, q) => { if (!isFinite(p[1])) return; q ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])); });
      ctx.stroke();
    } else for (const p of s.pts) {
      if (!isFinite(p[1])) continue;
      ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), p[2] ? 4 : 2, 0, 7);
      p[2] ? ctx.stroke() : ctx.fill();
    }
    ctx.fillText(s.label, W - 120, 12 + k * 11);
  });
}

export function drawMinimap(cv, run, th, leafOfPoint) {
  const ctx = cv.getContext('2d'), R = 40, C = run.prob.C;
  const cols = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];
  for (let a = 0; a < R; a++) for (let b = 0; b < R; b++) {
    const l = leafOfPoint(run.tree, [(a + 0.5) / R, (b + 0.5) / R]);
    let best = 0;
    for (let c = 1; c < C; c++) if (th.phi[l * C + c] > th.phi[l * C + best]) best = c;
    ctx.fillStyle = cols[best];
    ctx.fillRect(a * cv.width / R, cv.height - (b + 1) * cv.height / R, cv.width / R + 1, cv.height / R + 1);
  }
}