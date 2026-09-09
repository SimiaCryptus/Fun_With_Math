// Renders a porkchop grid to a canvas: colour = total Δv, white contour =
// the player's current Δv budget (the literal edge of where they can go).

const STOPS = [
  [0.00, [ 20,  60, 120]],
  [0.18, [ 30, 170, 190]],
  [0.36, [ 60, 210, 130]],
  [0.54, [230, 220,  90]],
  [0.72, [240, 140,  60]],
  [1.00, [190,  40,  60]],
];

function ramp(u) {
  u = Math.max(0, Math.min(1, u));
  for (let i = 1; i < STOPS.length; i++) {
    if (u <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
      const k = (u - a) / (b - a);
      return [
        ca[0] + (cb[0] - ca[0]) * k,
        ca[1] + (cb[1] - ca[1]) * k,
        ca[2] + (cb[2] - ca[2]) * k,
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} grid  result of planner.porkchop()
* @param {{budget:number, sel:{ix:number,iy:number}|null, nowIx?:number}} opts
*   budget: Δv budget m/s. nowIx: first column whose departure is not yet past.
 */
export function drawPorkchop(canvas, grid, opts = {}) {
  const { nx, ny, dv } = grid;
  canvas.width = nx; canvas.height = ny;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(nx, ny);

  const lo = grid.min.dv;
  const hi = Math.max(lo * 2.6, lo + 6000);
  const nowIx = opts.nowIx || 0;

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const v = dv[iy * nx + ix];
      // y is flipped so short TOF sits at the bottom
      const o = ((ny - 1 - iy) * nx + ix) * 4;
      if (!isFinite(v)) { img.data[o] = 6; img.data[o + 1] = 8; img.data[o + 2] = 12; img.data[o + 3] = 255; continue; }
      let [r, g, b] = ramp((v - lo) / (hi - lo));
      if (ix < nowIx) { r *= 0.35; g *= 0.35; b *= 0.35; }   // window already gone
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }

  // budget contour: mark cells that straddle the affordable boundary
  const budget = opts.budget;
  if (budget && isFinite(budget)) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const v = dv[iy * nx + ix];
        if (!isFinite(v)) continue;
        const rgt = dv[iy * nx + Math.min(nx - 1, ix + 1)];
        const dwn = dv[Math.min(ny - 1, iy + 1) * nx + ix];
        const edge = (isFinite(rgt) && (v - budget) * (rgt - budget) < 0) ||
                     (isFinite(dwn) && (v - budget) * (dwn - budget) < 0);
        if (edge) {
          const o = ((ny - 1 - iy) * nx + ix) * 4;
          img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);

  // markers drawn in grid space (canvas is upscaled by CSS)
  const dot = (ix, iy, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(ix - 1, ny - 1 - iy - 1, 3, 3);
  };
  if (grid.min.ix >= 0) dot(grid.min.ix, grid.min.iy, '#ffffff');
  if (opts.sel) dot(opts.sel.ix, opts.sel.iy, '#ff6ad5');
}