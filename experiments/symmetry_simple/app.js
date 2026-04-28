// ─────────────────────────────────────────────
//  Symmetry Diffusion App
// ─────────────────────────────────────────────

(function () {
  'use strict';

  // ── State ──────────────────────────────────
  let GRID_W = 64;
  let GRID_H = 64;
  let pixels = null;       // Float32Array, length GRID_W*GRID_H*3  (r,g,b in [0,1])
  let displayScale = 1;

  const state = {
    tool: 'draw',
    color: [1, 0.27, 0.27],
    brushSize: 2,
    showGrid: false,
    diffRate: 0.30,
      diffRenorm: 1.0,
    neighborhood: 8,
    playing: false,
    fps: 15,
    gridSize: 64,
    aspectRatio: 1.0,   // width / height  (e.g. 2.0 = landscape)
    symmetry: {
      translationX: false,
      translationY: false,
      mirrorX: false,
      mirrorY: false,
      rot180: false,
      rot90: false,
      rot60: false,
      rot30: false,
      diagonal: false,
    },
  };

  let animHandle = null;
  let lastFrameTime = 0;

  // ── Canvas setup ───────────────────────────
  const canvas = document.getElementById('main-canvas');
  const ctx = canvas.getContext('2d');
  let imageData = null;

  function recomputeGridDims() {
    // GRID_W is the "base" size; GRID_H is derived from aspect ratio
    // We keep GRID_W = gridSize and GRID_H = round(gridSize / aspectRatio)
    GRID_W = state.gridSize;
    GRID_H = Math.max(1, Math.round(state.gridSize / state.aspectRatio));
  }

  function initGrid() {
    recomputeGridDims();
    pixels = new Float32Array(GRID_W * GRID_H * 3);
    imageData = ctx.createImageData(GRID_W, GRID_H);
    resizeCanvas();
    clearPixels();
  }

  function resizeCanvas() {
    const area = document.getElementById('canvas-area');
    const maxW = area.clientWidth - 20;
    const maxH = area.clientHeight - 20;
    // Fit the grid (GRID_W x GRID_H) into the available area
    const scaleX = Math.floor(maxW / GRID_W);
    const scaleY = Math.floor(maxH / GRID_H);
    displayScale = Math.max(1, Math.min(scaleX, scaleY));
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    canvas.style.width  = (GRID_W * displayScale) + 'px';
    canvas.style.height = (GRID_H * displayScale) + 'px';
  }

  // ── Pixel helpers ──────────────────────────
  function idx(x, y) { return (y * GRID_W + x) * 3; }

  function getPixel(x, y) {
    const i = idx(x, y);
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  }

  function setPixel(x, y, r, g, b) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    const i = idx(x, y);
    pixels[i]     = Math.max(0, Math.min(1, r));
    pixels[i + 1] = Math.max(0, Math.min(1, g));
    pixels[i + 2] = Math.max(0, Math.min(1, b));
  }

  function clearPixels() {
    pixels.fill(0);
    render();
  }

  function randomPixels() {
    for (let i = 0; i < pixels.length; i++) pixels[i] = Math.random();
    render();
  }

  // ── Symmetry helpers ───────────────────────
  function wrapX(x) { return ((x % GRID_W) + GRID_W) % GRID_W; }
  function wrapY(y) { return ((y % GRID_H) + GRID_H) % GRID_H; }

  // Clamp-or-wrap a position depending on translation symmetry flags
  function addPos(positions, px, py) {
    const cx = state.symmetry.translationX ? wrapX(px) : px;
    const cy = state.symmetry.translationY ? wrapY(py) : py;
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return;
    positions.add(cx + ',' + cy);
  }

  // Returns list of [x,y] mirror positions for a given (x,y)
  function symmetryPositions(x, y) {
    const positions = new Set();

    const sym = state.symmetry;
    const W = GRID_W, H = GRID_H;
    const mx = W - 1 - x;
    const my = H - 1 - y;

    // Centre of grid (for rotational symmetry)
    const cx = (W - 1) / 2;
    const cy = (H - 1) / 2;

    const seeds = [[x, y]];

    if (sym.mirrorX)              seeds.push([mx, y]);
    if (sym.mirrorY)              seeds.push([x, my]);
    if (sym.mirrorX && sym.mirrorY) seeds.push([mx, my]);
   if (sym.rot180)               seeds.push([W - 1 - x, H - 1 - y]);

    if (sym.rot90) {
      // Rotate (x,y) around centre by 90°, 180°, 270°
      const dx = x - cx, dy = y - cy;
     seeds.push([Math.round(cx + dy), Math.round(cy - dx)]);  // +90°  (CCW)
     seeds.push([Math.round(cx - dx), Math.round(cy - dy)]);  // 180°
     seeds.push([Math.round(cx - dy), Math.round(cy + dx)]);  // +270° (CCW)
    }

    if (sym.rot60 || sym.rot30) {
      const dx = x - cx, dy = y - cy;
      const steps = sym.rot30 ? 12 : 6;
      const baseAngle = (2 * Math.PI) / steps;
      for (let k = 1; k < steps; k++) {
        const angle = k * baseAngle;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        seeds.push([
          Math.round(cx + dx * cos - dy * sin),
          Math.round(cy + dx * sin + dy * cos),
        ]);
      }
    }

    if (sym.diagonal) {
      seeds.push([y, x]);
     // anti-diagonal reflection: (x,y) -> (H-1-y, W-1-x) — only add when both mirrors active
     if (sym.mirrorX && sym.mirrorY) seeds.push([my, mx]);
    }

    for (const [sx, sy] of seeds) {
      addPos(positions, sx, sy);
      if (sym.translationX) {
        addPos(positions, sx + Math.floor(W / 2), sy);
        addPos(positions, sx - Math.floor(W / 2), sy);
      }
      if (sym.translationY) {
        addPos(positions, sx, sy + Math.floor(H / 2));
        addPos(positions, sx, sy - Math.floor(H / 2));
      }
    }

    return [...positions].map(s => s.split(',').map(Number));
  }

  // ── Drawing ────────────────────────────────
  function paintAt(x, y) {
    const r = state.color[0], g = state.color[1], b = state.color[2];
    const bs = state.brushSize;

   for (let dy = -bs + 1; dy < bs; dy++) {
     for (let dx = -bs + 1; dx < bs; dx++) {
       if (dx * dx + dy * dy < bs * bs) {
         const tx = ((x + dx) % GRID_W + GRID_W) % GRID_W;
         const ty = ((y + dy) % GRID_H + GRID_H) % GRID_H;
         if (state.tool === 'erase') {
           setPixel(tx, ty, 0, 0, 0);
         } else {
           setPixel(tx, ty, r, g, b);
         }
       }
     }
   }
  }

  function floodFill(x, y) {
    const [tr, tg, tb] = getPixel(x, y);
    const [fr, fg, fb] = state.color;
    const eps = 0.01;
    if (Math.abs(tr - fr) < eps && Math.abs(tg - fg) < eps && Math.abs(tb - fb) < eps) return;

    const stack = [[x, y]];
    const visited = new Uint8Array(GRID_W * GRID_H);

    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) continue;
      if (visited[cy * GRID_W + cx]) continue;
      const [pr, pg, pb] = getPixel(cx, cy);
      if (Math.abs(pr - tr) > 0.05 || Math.abs(pg - tg) > 0.05 || Math.abs(pb - tb) > 0.05) continue;
      visited[cy * GRID_W + cx] = 1;
      setPixel(cx, cy, fr, fg, fb);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  // ── Neighborhood / Diffusion ───────────────
  function getNeighbors(x, y) {
    const neighbors = [];
    const n = state.neighborhood;

    const offsets4  = [[1,0],[-1,0],[0,1],[0,-1]];
    const offsets8  = [...offsets4, [1,1],[1,-1],[-1,1],[-1,-1]];
    const offsets12 = [...offsets8, [2,0],[-2,0],[0,2],[0,-2]];

    const offsets = n === 4 ? offsets4 : n === 8 ? offsets8 : offsets12;

    for (const [dx, dy] of offsets) {
      const nx = x + dx, ny = y + dy;

      const wx = state.symmetry.translationX ? wrapX(nx) : nx;
      const wy = state.symmetry.translationY ? wrapY(ny) : ny;

      if (wx < 0 || wx >= GRID_W || wy < 0 || wy >= GRID_H) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      const weight = 1 / dist;
      neighbors.push({ x: wx, y: wy, w: weight });
    }

    // Symmetry-induced extra connections
    const sym = state.symmetry;
    const W = GRID_W, H = GRID_H;
    const mx = W - 1 - x, my = H - 1 - y;
    const cx = (W - 1) / 2, cy = (H - 1) / 2;
    const symPeers = [];

    if (sym.mirrorX) symPeers.push([mx, y]);
    if (sym.mirrorY) symPeers.push([x, my]);
    if (sym.rot180)  symPeers.push([mx, my]);
    if (sym.rot90) {
      const dx = x - cx, dy = y - cy;
     symPeers.push([cx + dy, cy - dx]);  // +90°  (CCW)
     symPeers.push([cx - dx, cy - dy]);  // 180°
     symPeers.push([cx - dy, cy + dx]);  // +270° (CCW)
    }
    if (sym.rot60 || sym.rot30) {
      const dx = x - cx, dy = y - cy;
      const steps = sym.rot30 ? 12 : 6;
      const baseAngle = (2 * Math.PI) / steps;
      for (let k = 1; k < steps; k++) {
        const angle = k * baseAngle;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        symPeers.push([
         cx + dx * cos - dy * sin,
         cy + dx * sin + dy * cos,
        ]);
      }
    }
   if (sym.diagonal) symPeers.push([y, x]);   // already integer
   if (sym.diagonal && sym.mirrorX && sym.mirrorY) symPeers.push([my, mx]); // anti-diagonal
   // Helper: add bilinear (nearest-4) weighted connections for a fractional peer position
   function addBilinearNeighbors(fx, fy, baseWeight) {
     const x0 = Math.floor(fx), y0 = Math.floor(fy);
     const x1 = x0 + 1,        y1 = y0 + 1;
     const tx = fx - x0,        ty = fy - y0;
     const corners = [
       { cx: x0, cy: y0, w: (1 - tx) * (1 - ty) },
       { cx: x1, cy: y0, w:      tx  * (1 - ty) },
       { cx: x0, cy: y1, w: (1 - tx) *      ty  },
       { cx: x1, cy: y1, w:      tx  *       ty  },
     ];
     for (const { cx, cy, w } of corners) {
       if (w < 1e-6) continue;
       if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) continue;
       if (cx === x && cy === y) continue;
       neighbors.push({ x: cx, y: cy, w: baseWeight * w });
     }
   }


    for (const [sx, sy] of symPeers) {
    addBilinearNeighbors(sx, sy, 1.0);
    }

    return neighbors;
  }

  function diffuseStep() {
    const rate    = state.diffRate;
    const renorm  = state.diffRenorm;
    const N       = GRID_W * GRID_H;
    const next    = new Float32Array(pixels.length);

    // ── Compute per-channel mean and variance of current frame ──
    // Used for moment-preserving renormalisation.
    const mean = [0, 0, 0];
    const variance = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      mean[0] += pixels[i * 3];
      mean[1] += pixels[i * 3 + 1];
      mean[2] += pixels[i * 3 + 2];
    }
    mean[0] /= N; mean[1] /= N; mean[2] /= N;
    for (let i = 0; i < N; i++) {
      variance[0] += (pixels[i * 3]     - mean[0]) ** 2;
      variance[1] += (pixels[i * 3 + 1] - mean[1]) ** 2;
      variance[2] += (pixels[i * 3 + 2] - mean[2]) ** 2;
    }
    variance[0] /= N; variance[1] /= N; variance[2] /= N;
    const std = [
      Math.sqrt(variance[0]) || 0,
      Math.sqrt(variance[1]) || 0,
      Math.sqrt(variance[2]) || 0,
    ];

    // ── Diffuse ──
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const neighbors = getNeighbors(x, y);
        let totalW = 0;
        for (const nb of neighbors) totalW += nb.w;

        const i = idx(x, y);
        let nr = pixels[i], ng = pixels[i + 1], nb2 = pixels[i + 2];

        for (const nb of neighbors) {
          const j   = idx(nb.x, nb.y);
          const wn  = nb.w / (totalW || 1);
          nr  += rate * wn * (pixels[j]     - pixels[i]);
          ng  += rate * wn * (pixels[j + 1] - pixels[i + 1]);
          nb2 += rate * wn * (pixels[j + 2] - pixels[i + 2]);
        }

        next[i]     = nr;
        next[i + 1] = ng;
        next[i + 2] = nb2;
      }
    }

    // ── Moment-preserving renormalisation ──
    // After diffusion the distribution has shifted mean and std.
    // We compute the new moments and blend back toward the original ones.
    if (renorm > 0) {
      const newMean = [0, 0, 0];
      for (let i = 0; i < N; i++) {
        newMean[0] += next[i * 3];
        newMean[1] += next[i * 3 + 1];
        newMean[2] += next[i * 3 + 2];
      }
      newMean[0] /= N; newMean[1] /= N; newMean[2] /= N;

      const newVariance = [0, 0, 0];
      for (let i = 0; i < N; i++) {
        newVariance[0] += (next[i * 3]     - newMean[0]) ** 2;
        newVariance[1] += (next[i * 3 + 1] - newMean[1]) ** 2;
        newVariance[2] += (next[i * 3 + 2] - newMean[2]) ** 2;
      }
      newVariance[0] /= N; newVariance[1] /= N; newVariance[2] /= N;
      const newStd = [
        Math.sqrt(newVariance[0]) || 1e-9,
        Math.sqrt(newVariance[1]) || 1e-9,
        Math.sqrt(newVariance[2]) || 1e-9,
      ];

      for (let i = 0; i < N; i++) {
        for (let c = 0; c < 3; c++) {
          const raw = next[i * 3 + c];
          // Standardise with new moments, then rescale to original moments
          const rescaled = std[c] > 1e-9
            ? mean[c] + (raw - newMean[c]) * (std[c] / newStd[c])
            : mean[c];
          // Blend: renorm=0 → keep raw diffused; renorm=1 → fully moment-matched
          next[i * 3 + c] = Math.max(0, Math.min(1,
            raw * (1 - renorm) + rescaled * renorm
          ));
        }
      }
    } else {
      // Just clamp
      for (let i = 0; i < next.length; i++) {
        next[i] = Math.max(0, Math.min(1, next[i]));
      }
    }

    pixels = next;
  }

  // ── Render ─────────────────────────────────
  function render() {
    const data = imageData.data;
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const pi = i * 3;
      const di = i * 4;
      data[di]     = Math.round(pixels[pi]     * 255);
      data[di + 1] = Math.round(pixels[pi + 1] * 255);
      data[di + 2] = Math.round(pixels[pi + 2] * 255);
      data[di + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    if (state.showGrid && displayScale >= 4) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1 / displayScale;
      for (let x = 0; x <= GRID_W; x++) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GRID_H); ctx.stroke();
      }
      for (let y = 0; y <= GRID_H; y++) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GRID_W, y); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Animation loop ─────────────────────────
  function animLoop(ts) {
    if (!state.playing) return;
    const interval = 1000 / state.fps;
    if (ts - lastFrameTime >= interval) {
      lastFrameTime = ts;
      diffuseStep();
      render();
    }
    animHandle = requestAnimationFrame(animLoop);
  }

  function startPlay() {
    if (state.playing) return;
    state.playing = true;
    lastFrameTime = 0;
    animHandle = requestAnimationFrame(animLoop);
  }

  function stopPlay() {
    state.playing = false;
    if (animHandle) cancelAnimationFrame(animHandle);
  }

  // ── Mouse interaction ──────────────────────
  let isDrawing = false;
  let lastDrawPos = null;

  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = GRID_W / rect.width;
    const scaleY = GRID_H / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top)  * scaleY);
    return [
      Math.max(0, Math.min(GRID_W - 1, x)),
      Math.max(0, Math.min(GRID_H - 1, y))
    ];
  }

  function lerp2D(x0, y0, x1, y1, callback) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const steps = Math.max(dx, dy, 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      callback(
        Math.round(x0 + (x1 - x0) * t),
        Math.round(y0 + (y1 - y0) * t)
      );
    }
  }

  canvas.addEventListener('mousedown', e => {
    isDrawing = true;
    const [x, y] = canvasPos(e);
    lastDrawPos = [x, y];
    if (state.tool === 'fill') {
      floodFill(x, y);
    } else {
      paintAt(x, y);
    }
    render();
  });

  canvas.addEventListener('mousemove', e => {
    const [x, y] = canvasPos(e);
    const [r, g, b] = getPixel(x, y);
    document.getElementById('info-text').textContent =
      `Pos: (${x}, ${y})\nRGB: (${(r*255)|0}, ${(g*255)|0}, ${(b*255)|0})`;

    if (!isDrawing || state.tool === 'fill') return;
    if (lastDrawPos) {
      lerp2D(lastDrawPos[0], lastDrawPos[1], x, y, (lx, ly) => paintAt(lx, ly));
    }
    lastDrawPos = [x, y];
    render();
  });

  canvas.addEventListener('mouseup',    () => { isDrawing = false; lastDrawPos = null; });
  canvas.addEventListener('mouseleave', () => { isDrawing = false; lastDrawPos = null; });

  // Touch support
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY }));
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touch = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY }));
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    canvas.dispatchEvent(new MouseEvent('mouseup'));
  }, { passive: false });

  // ── UI wiring ──────────────────────────────
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
    });
  });

  // Color picker
  const colorPicker = document.getElementById('color-picker');
  colorPicker.addEventListener('input', () => {
    state.color = hexToRgb(colorPicker.value);
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  });

  // Palette swatches
  document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const hex = swatch.dataset.color;
      colorPicker.value = hex;
      state.color = hexToRgb(hex);
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  // Brush size
  const brushSlider = document.getElementById('brush-size');
  brushSlider.addEventListener('input', () => {
    state.brushSize = parseInt(brushSlider.value);
    document.getElementById('brush-size-val').textContent = state.brushSize;
  });

  // Symmetry checkboxes
  const symMap = {
    'sym-translation-x': 'translationX',
    'sym-translation-y': 'translationY',
    'sym-mirror-x':      'mirrorX',
    'sym-mirror-y':      'mirrorY',
    'sym-rot180':        'rot180',
    'sym-rot90':         'rot90',
    'sym-rot60':         'rot60',
    'sym-rot30':         'rot30',
    'sym-diagonal':      'diagonal',
  };
  Object.entries(symMap).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', e => {
      state.symmetry[key] = e.target.checked;
    });
  });

  // Diffusion controls
  const diffRateSlider = document.getElementById('diff-rate');
  diffRateSlider.addEventListener('input', () => {
    state.diffRate = parseInt(diffRateSlider.value) / 100;
    document.getElementById('diff-rate-val').textContent = state.diffRate.toFixed(2);
  });

  const diffRenormSlider = document.getElementById('diff-renorm');
  diffRenormSlider.addEventListener('input', () => {
    state.diffRenorm = parseInt(diffRenormSlider.value) / 100;
    document.getElementById('diff-renorm-val').textContent = state.diffRenorm.toFixed(2);
  });

  document.getElementById('diff-neighborhood').addEventListener('change', e => {
    state.neighborhood = parseInt(e.target.value);
  });

  document.getElementById('btn-step').addEventListener('click', () => {
    diffuseStep();
    render();
  });

  document.getElementById('btn-play').addEventListener('click', startPlay);
  document.getElementById('btn-stop').addEventListener('click', stopPlay);

  const speedSlider = document.getElementById('diff-speed');
  speedSlider.addEventListener('input', () => {
    state.fps = parseInt(speedSlider.value);
    document.getElementById('diff-speed-val').textContent = state.fps;
  });

  // Canvas / grid controls
  document.getElementById('grid-size').addEventListener('change', e => {
    stopPlay();
    state.gridSize = parseInt(e.target.value);
    initGrid();
  });

  // Aspect ratio
  const aspectSlider = document.getElementById('aspect-ratio');
  const aspectVal    = document.getElementById('aspect-ratio-val');
  aspectSlider.addEventListener('input', () => {
    // Slider range 25–400, value = ratio * 100
    state.aspectRatio = parseInt(aspectSlider.value) / 100;
    aspectVal.textContent = state.aspectRatio.toFixed(2);
    stopPlay();
    initGrid();
  });

  document.getElementById('btn-clear').addEventListener('click', clearPixels);
  document.getElementById('btn-random').addEventListener('click', randomPixels);

  document.getElementById('btn-save').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'symmetry_diffusion.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  document.getElementById('show-grid').addEventListener('change', e => {
    state.showGrid = e.target.checked;
    render();
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
    render();
  });

  // ── Boot ───────────────────────────────────
  initGrid();
  render();

})();