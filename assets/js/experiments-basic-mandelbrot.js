(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvasWrap');
  const iterRange = document.getElementById('iterRange');
  const iterLabel = document.getElementById('iterLabel');
  const colorSelect = document.getElementById('colorScheme');
  const renderBtn = document.getElementById('renderBtn');
  const resetBtn = document.getElementById('resetBtn');
  const coords = document.getElementById('coords');
  const progress = document.getElementById('progress');

  // Viewport in complex-plane coordinates
  let view = { xMin: -2.5, xMax: 1.0, yMin: -1.25, yMax: 1.25 };

  function resize() {
    const w = wrap.clientWidth;
    const h = Math.round(w * 0.65);
    canvas.width = w;
    canvas.height = h;
    render();
  }

  // ── Colour palettes ──────────────────────────────────────
  function palette(scheme, t) {
    // t in [0,1]
    switch (scheme) {
      case 'fire': {
        const r = Math.min(255, Math.round(t * 3 * 255));
        const g = Math.min(255, Math.max(0, Math.round((t * 3 - 1) * 255)));
        const b = Math.min(255, Math.max(0, Math.round((t * 3 - 2) * 255)));
        return [r, g, b];
      }
      case 'greyscale': {
        const v = Math.round(t * 255);
        return [v, v, v];
      }
      case 'rainbow': {
        const h6 = t * 6;
        const s = Math.floor(h6);
        const f = h6 - s;
        const q = Math.round((1 - f) * 255);
        const p2 = Math.round(f * 255);
        const lut = [
          [255, p2, 0],
          [q, 255, 0],
          [0, 255, p2],
          [0, q, 255],
          [p2, 0, 255],
          [255, 0, q],
        ];
        return lut[s % 6];
      }
      default: {
        // classic blue
        const r = Math.round(9 * (1 - t) * t * t * t * 255);
        const g = Math.round(15 * (1 - t) * (1 - t) * t * t * 255);
        const b = Math.round(8.5 * (1 - t) * (1 - t) * (1 - t) * t * 255);
        return [r, g, b];
      }
    }
  }

  // ── Core rendering (chunked to stay responsive) ──────────
  let renderToken = 0;

  function render() {
    const token = ++renderToken;
    const W = canvas.width,
      H = canvas.height;
    const maxIter = parseInt(iterRange.value);
    const scheme = colorSelect.value;
    const { xMin, xMax, yMin, yMax } = view;
    const xRange = xMax - xMin,
      yRange = yMax - yMin;

    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    renderBtn.disabled = true;
    progress.style.width = '0%';

    const CHUNK = 32; // rows per chunk
    let row = 0;

    function processChunk() {
      if (token !== renderToken) return; // superseded
      const endRow = Math.min(row + CHUNK, H);
      for (let y = row; y < endRow; y++) {
        const ci = yMin + (y / H) * yRange;
        for (let x = 0; x < W; x++) {
          const cr = xMin + (x / W) * xRange;
          let zr = 0,
            zi = 0,
            iter = 0;
          while (iter < maxIter && zr * zr + zi * zi <= 4) {
            const tmp = zr * zr - zi * zi + cr;
            zi = 2 * zr * zi + ci;
            zr = tmp;
            iter++;
          }
          const idx = (y * W + x) * 4;
          if (iter === maxIter) {
            data[idx] = data[idx + 1] = data[idx + 2] = 0;
          } else {
            const t = Math.sqrt(iter / maxIter);
            const [r, g, b] = palette(scheme, t);
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      row = endRow;
      progress.style.width = (row / H) * 100 + '%';

      if (row < H) {
        requestAnimationFrame(processChunk);
      } else {
        renderBtn.disabled = false;
        progress.style.width = '100%';
        setTimeout(() => {
          progress.style.width = '0%';
        }, 400);
      }
    }
    processChunk();
  }

  // ── Coordinate utilities ─────────────────────────────────
  function toComplex(px, py) {
    const { xMin, xMax, yMin, yMax } = view;
    return {
      re: xMin + (px / canvas.width) * (xMax - xMin),
      im: yMin + (py / canvas.height) * (yMax - yMin),
    };
  }

  function zoomAt(px, py, factor) {
    const c = toComplex(px, py);
    const wHalf = ((view.xMax - view.xMin) * factor) / 2;
    const hHalf = ((view.yMax - view.yMin) * factor) / 2;
    view = {
      xMin: c.re - wHalf,
      xMax: c.re + wHalf,
      yMin: c.im - hHalf,
      yMax: c.im + hHalf,
    };
    render();
  }

  // ── Scroll to zoom ───────────────────────────────────────
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      const factor = e.deltaY > 0 ? 1.3 : 0.77;
      zoomAt(px, py, factor);
    },
    { passive: false }
  );

  // ── Double-click zoom ────────────────────────────────────
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    zoomAt(px, py, 0.5);
  });

  // ── Drag to pan ──────────────────────────────────────────
  let drag = null;
  canvas.addEventListener('mousedown', (e) => {
    drag = { x: e.clientX, y: e.clientY, view: { ...view } };
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
        const c = toComplex(px, py);
        coords.textContent = `Re: ${c.re.toFixed(6)}  Im: ${c.im.toFixed(6)}`;
      }
      return;
    }
    const dx = (e.clientX - drag.x) / canvas.getBoundingClientRect().width;
    const dy = (e.clientY - drag.y) / canvas.getBoundingClientRect().height;
    const dRe = dx * (drag.view.xMax - drag.view.xMin);
    const dIm = dy * (drag.view.yMax - drag.view.yMin);
    view = {
      xMin: drag.view.xMin - dRe,
      xMax: drag.view.xMax - dRe,
      yMin: drag.view.yMin - dIm,
      yMax: drag.view.yMax - dIm,
    };
    render();
  });
  window.addEventListener('mouseup', () => {
    drag = null;
  });

  // ── Buttons ──────────────────────────────────────────────
  iterRange.addEventListener('input', () => {
    iterLabel.textContent = iterRange.value;
  });
  renderBtn.addEventListener('click', render);
  resetBtn.addEventListener('click', () => {
    view = { xMin: -2.5, xMax: 1.0, yMin: -1.25, yMax: 1.25 };
    render();
  });

  // ── Init ─────────────────────────────────────────────────
  new ResizeObserver(resize).observe(wrap);
  resize();
})();
